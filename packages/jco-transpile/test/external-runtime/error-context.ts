import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, transpileBytes, writeFiles } from '../transpilation.js';
import { composeCallerCallee } from '../p3/ported/wasmtime/component-async/common.js';
const errorContextUrl = new URL('intrinsics/error-context.js', defaultRuntimeUrl).href;
const execAsync = promisify(execFile);

function component(encoding: string) {
    return `(component
 (core module $libc
  (memory (export "memory") 1)
  (global $next (mut i32) (i32.const 1024))
  (func (export "realloc") (param i32 i32 i32 i32) (result i32)
   (local $ptr i32)
   (local.set $ptr (i32.and (i32.add (global.get $next) (i32.sub (local.get 2) (i32.const 1)))
    (i32.sub (i32.const 0) (local.get 2))))
   (global.set $next (i32.add (local.get $ptr) (local.get 3)))
   (local.get $ptr)))
 (core instance $libc (instantiate $libc))
 (alias core export $libc "memory" (core memory $mem))
 (alias core export $libc "realloc" (core func $realloc))
 (core func $new (canon error-context.new string-encoding=${encoding} (memory $mem)))
 (core func $debug (canon error-context.debug-message string-encoding=${encoding} (memory $mem) (realloc $realloc)))
 (core func $drop (canon error-context.drop))
 (core module $m
  (import "" "new" (func $new (param i32 i32) (result i32)))
  (import "" "debug" (func $debug (param i32 i32)))
  (import "" "drop" (func $drop (param i32)))
  (func (export "echo") (param i32 i32) (result i32)
   (local $handle i32)
   (local.set $handle (call $new (local.get 0) (local.get 1)))
   (call $debug (local.get $handle) (i32.const 8))
   (call $drop (local.get $handle))
   (i32.const 8)))
 (core instance $i (instantiate $m (with "" (instance
  (export "new" (func $new)) (export "debug" (func $debug)) (export "drop" (func $drop))))))
 (func (export "echo") (param "message" string) (result string)
  (canon lift (core func $i "echo") string-encoding=${encoding} (memory $mem) (realloc $realloc)))
)`;
}

// Future payload lowering directly requires the raw global-table constructor.
const GLOBAL_TABLE_COMPONENT = `(component
 (type $future (future error-context))
 (core func $new (canon future.new $future))
 (core module $caller
  (import "" "new" (func $new (result i64)))
  (func (export "new") (result i64) (call $new)))
 (core instance $caller (instantiate $caller (with "" (instance (export "new" (func $new))))))
 (func (export "new") (result u64) (canon lift (core func $caller "new")))
)`;

async function writeProvider(dir: string, source: string) {
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    await mkdir(join(dir, 'provider/intrinsics'), { recursive: true });
    await writeFile(join(dir, 'provider/runtime.js'), 'export const CM_RUNTIME_API_VERSION = 1;');
    for (const suffix of [
        'conversion',
        'js-helper',
        'string',
        'webidl',
        'resource',
        'core',
        'component',
        'waitable',
        'async-task',
    ]) {
        await writeFile(
            join(dir, 'provider/intrinsics/' + suffix + '.js'),
            'export * from ' + JSON.stringify(new URL('intrinsics/' + suffix + '.js', defaultRuntimeUrl).href) + ';',
        );
    }
    await writeFile(join(dir, 'provider/intrinsics/error-context.js'), source);
}
function providerSource() {
    return `import * as defaults from ${JSON.stringify(errorContextUrl)};
export * from ${JSON.stringify(errorContextUrl)};
export const calls = [], constructors = [], localTables = [], registrations = [], contexts = [], transferReceivers = [];
export function initializeGlobalErrorContextTableClass(RepTable) {
 const constructor = defaults.initializeGlobalErrorContextTableClass(RepTable); constructors.push(constructor); return constructor;
}
export function initializeLocalErrorContextTables(...args) {
 if (args.length) throw new Error('map initializer received context');
 const owner = defaults.initializeLocalErrorContextTables(); localTables.push(owner); return owner;
}
export function initializeErrorContextTableRegistrations(...args) {
 if (args.length) throw new Error('record initializer received context');
 const owner = defaults.initializeErrorContextTableRegistrations(); registrations.push(owner); return owner;
}
function check(context, keys) {
 if (Object.keys(context).sort().join() !== keys || !constructors.includes(context.globalTable)) throw new Error('invalid error-context capabilities');
 if (context.local && !localTables.includes(context.local.localTables)) throw new Error('detached local tables');
}
export function errCtxNew(context, metadata, ptr, len) {
 if (this !== null) throw new Error('lost new callback receiver');
 check(context, 'globalTable,local,lookup'); calls.push('new'); contexts.push(context);
 return defaults.errCtxNew(context, metadata, ptr, len);
}
export function errCtxDebugMessage(context, metadata, handle, ptr) {
 if (this !== null) throw new Error('lost debug callback receiver');
 check(context, 'RuntimeError,globalTable,lookup'); calls.push('debug');
 return defaults.errCtxDebugMessage(context, metadata, handle, ptr);
}
export function errCtxDrop(context, metadata, handle) {
 if (this !== null) throw new Error('lost drop callback receiver');
 check(context, 'RuntimeError,globalTable,local,lookup'); calls.push('drop');
 return defaults.errCtxDrop(context, metadata, handle);
}
export function errCtxTransfer(context, handle, source, destination) {
 transferReceivers.push(this);
 if (this !== undefined) throw new Error('lost direct transfer callback receiver');
 check(context, 'globalTable,local,lookup,tables');
 if (!registrations.includes(context.tables)) throw new Error('detached registrations');
 calls.push('transfer'); return defaults.errCtxTransfer(context, handle, source, destination);
}
// Re-exported defaults call their own static dependencies, not sibling overrides.
export function errCtxReserveGlobalRep() { throw new Error('unexpected sibling interception'); }
`;
}

for (const encoding of ['utf8', 'utf16']) {
    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.concurrent.each([false, true])(
            `named error-context provider (${encoding}, ${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                const dir = await getTmpDir();
                try {
                    await writeProvider(dir, providerSource());
                    const { files } = await transpileBytes(await parse(component(encoding)), {
                        name: 'error-context',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: './provider/',
                    });
                    await writeFiles(files, { baseDir: dir });
                    if (!minify) {
                        const source = new TextDecoder().decode(files['error-context.js']);
                        assert.notInclude(source, 'class GlobalErrorContextTable');
                        assert.notInclude(source, 'function errCtxNew(');
                        assert.notInclude(source, 'let errCtxLocal = new Map()');
                        assert.include(source, 'initializeGlobalErrorContextTableClass');
                        assert.include(
                            source,
                            'globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext',
                        );
                    }
                    const bindings = await import(pathToFileURL(join(dir, 'error-context.js')).href);
                    const provider = await import(
                        pathToFileURL(join(dir, 'provider/intrinsics/error-context.js')).href
                    );
                    const instantiate = () =>
                        bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                    const instance = instantiation ? await instantiate() : bindings;
                    assert.isNull(provider.constructors[0].data);
                    for (const message of ['', 'café 中文 🦀', '\ufeffbom', '\ud800x\udc00']) {
                        assert.strictEqual(instance.echo(message), message.toWellFormed());
                        assert.strictEqual(provider.constructors[0].get().size(), 0);
                    }
                    assert.includeMembers(provider.calls, ['new', 'debug', 'drop']);
                    assert.strictEqual(new Set(provider.contexts).size, 1);
                    assert.isAbove(Object.keys(provider.registrations[0]).length, 0);
                    for (const tables of provider.localTables[0].values()) {
                        for (const table of tables.values()) {
                            assert.strictEqual(table.size(), 0);
                        }
                    }
                    if (instantiation) {
                        const second = await instantiate();
                        assert.isNull(provider.constructors[1].data);
                        assert.strictEqual(second.echo('second'), 'second');
                        for (const key of ['constructors', 'registrations', 'localTables']) {
                            assert.lengthOf(provider[key], 2);
                            assert.notStrictEqual(provider[key][0], provider[key][1]);
                        }
                        assert.notStrictEqual(
                            provider.contexts[0].lookup.asyncState,
                            provider.contexts.at(-1).lookup.asyncState,
                        );
                    }
                } finally {
                    await rm(dir, { recursive: true, force: true });
                }
            },
        );
    }
}

test.concurrent.each([
    'initializeGlobalErrorContextTableClass',
    'initializeLocalErrorContextTables',
    'initializeErrorContextTableRegistrations',
    'errCtxNew',
])('native ESM rejects a missing error-context export: %s', async (missing) => {
    const dir = await getTmpDir();
    try {
        const exports = [
            'initializeGlobalErrorContextTableClass',
            'initializeLocalErrorContextTables',
            'initializeErrorContextTableRegistrations',
            'errCtxNew',
            'errCtxDebugMessage',
            'errCtxDrop',
            'errCtxTransfer',
            'errCtxGetLocalTable',
            'errCtxGlobalRefCountAdd',
            'errCtxCreateLocalHandle',
            'errCtxReserveGlobalRep',
        ].filter((name) => name !== missing);
        await writeProvider(dir, `export { ${exports.join(', ')} } from ${JSON.stringify(errorContextUrl)};`);
        const fixture =
            missing === 'initializeGlobalErrorContextTableClass' ? GLOBAL_TABLE_COMPONENT : component('utf8');
        const { files } = await transpileBytes(await parse(fixture), {
            name: 'missing',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider/',
        });
        await writeFiles(files, { baseDir: dir });
        await expect(execAsync(process.execPath, [join(dir, 'missing.js')])).rejects.toThrow(missing);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each([false, true])('composed error-context transfer callback (external=%s)', async (external) => {
    const dir = await getTmpDir();
    try {
        await writeProvider(dir, providerSource());
        const fixtureDir = fileURLToPath(new URL('../fixtures/components/p3/error-context/', import.meta.url));
        const composed = await composeCallerCallee({
            callerPath: join(fixtureDir, 'async-error-context-caller.wasm'),
            calleePath: join(fixtureDir, 'async-error-context-callee.wasm'),
            outputPath: join(dir, 'composed.wasm'),
        });
        const { files } = await transpile(composed, {
            name: 'composed',
            instantiation: 'sync',
            asyncExports: ['local:local/run#run'],
            cmRuntimeEsModule: external ? './provider/' : undefined,
        });
        const source = new TextDecoder().decode(files['composed.js']);
        assert.match(
            source,
            external
                ? /const trampoline\d+ = errCtxTransfer\.bind\((?:undefined|void 0), _jcoErrorContextTransferContext\);/
                : /const trampoline\d+ = errCtxTransfer;/,
        );
        if (external) {
            // Evaluate the emitted callback in a scope with a component-style
            // binding named undefined. Its receiver must remain undefined.
            let replacements = 0;
            const shadowed = source.replace(
                /(const trampoline\d+ = )(errCtxTransfer\.bind\((?:undefined|void 0), _jcoErrorContextTransferContext\));/g,
                (_match, declaration, expression) => {
                    replacements++;
                    return `${declaration}((undefined) => ${expression})({ shadowed: true });`;
                },
            );
            assert.isAbove(replacements, 0);
            files['composed.js'] = new TextEncoder().encode(shadowed);
        }
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'composed.js')).href);
        const { WASIShim } = await import('@bytecodealliance/preview2-shim/instantiation');
        const instance = bindings.instantiate(
            (name: string) => new WebAssembly.Module(files[name]),
            new WASIShim().getImportObject(),
        );
        try {
            await instance['local:local/run'].run();
        } finally {
            if (external) {
                const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/error-context.js')).href);
                assert.isAbove(provider.transferReceivers.length, 0);
                assert.deepEqual(
                    provider.transferReceivers,
                    provider.transferReceivers.map(() => undefined),
                );
                assert.include(provider.calls, 'transfer');
            }
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
