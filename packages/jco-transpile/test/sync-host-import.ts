import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { transpileBytes as transpile, writeFiles } from './transpilation.js';

const leaf = new TextEncoder().encode(`(component
    (import "host" (func $host (param "n" u32) (result u32)))
    (core func $lower (canon lower (func $host)))
    (core module $module
        (import "" "host" (func $host (param i32) (result i32)))
        (global $initial (mut i32) (i32.const 0))
        (func $start (global.set $initial (call $host (i32.const 7))))
        (start $start)
        (func (export "run") (param i32) (result i32)
            (i32.add (global.get $initial) (call $host (local.get 0)))))
    (core instance $i (instantiate $module (with "" (instance (export "host" (func $lower))))))
    (func (export "run") (param "n" u32) (result u32) (canon lift (core func $i "run"))))`);

test('only the standard synchronous lowers omit subtask diagnostic names', async () => {
    const checked = '@bytecodealliance/jco-cm-runtime';
    const cases = [
        { provider: undefined, specialize: true, named: false },
        { provider: checked, specialize: true, named: false },
        { provider: checked, specialize: false, named: true },
        { provider: './custom-runtime', specialize: true, named: true },
    ];
    for (const { provider, specialize, named } of cases) {
        const { files } = await transpile(leaf, {
            name: 'leaf',
            cmRuntimeEsModule: provider,
            cmRuntimeSyncImports: specialize,
        });
        const source = new TextDecoder().decode(files['leaf.js']);
        expect(/_trampoline\d+\.fnName\s*=/.test(source)).toBe(named);
    }
});

describe.each(['bundled', 'external'] as const)('%s checked runtime', (mode) => {
    async function transpileBytes(component: Uint8Array, options: Parameters<typeof transpile>[1]) {
        const provider = mode === 'external' ? new URL('../../jco-cm-runtime/dist/', import.meta.url).href : undefined;
        const result = await transpile(component, {
            ...options,
            cmRuntimeEsModule: provider,
            cmRuntimeSyncImports: !!provider,
        });
        const source = new TextDecoder().decode(result.files[options!.name + '.js']);
        expect(source.includes('/intrinsics/sync.js')).toBe(mode === 'external');
        expect(source).toContain('_lowerSyncImport(');
        return result;
    }

    test('sync imports preserve initialization results, host errors and instance stopping', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-sync-host-'));
        try {
            const { files } = await transpileBytes(leaf, { name: 'leaf', instantiation: 'async' });
            await writeFiles(files, { baseDir: dir });
            const { instantiate } = await import(pathToFileURL(join(dir, 'leaf.js')).href);
            const error = new Error('host failed');
            const instance = await instantiate(undefined, {
                host: {
                    default(n: number) {
                        if (n === 0) {
                            throw error;
                        }
                        return n + 1;
                    },
                },
            });
            expect(instance.run(3)).toBe(12);
            expect(() => instance.run(0)).toThrow(error);
            await instance._util.whenIdle();

            const lifecycle: { stop?: () => void } = {};
            const other = await instantiate(undefined, {
                host: {
                    default(n: number) {
                        lifecycle.stop?.();
                        return n;
                    },
                },
            });
            lifecycle.stop = () => other._util.stop();
            expect(() => other.run(1)).toThrow(/stopped/);
            expect(() => other.run(1)).toThrow(/stopped/);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('a lowered import called outside Wasm gets its own task', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-sync-detached-'));
        try {
            const { files } = await transpileBytes(leaf, { name: 'leaf', instantiation: 'async' });
            await writeFiles(files, { baseDir: dir });
            const { instantiate } = await import(pathToFileURL(join(dir, 'leaf.js')).href);
            let lowered!: (value: number) => number;
            const capture = (module: WebAssembly.Module, imports: WebAssembly.Imports) => {
                lowered = imports[''].host as typeof lowered;
                return new WebAssembly.Instance(module, imports);
            };
            const hostError = new Error('outside Wasm');
            const guest = await instantiate(
                undefined,
                {
                    host: {
                        default(n: number) {
                            if (!n) {
                                throw hostError;
                            }
                            return n + 1;
                        },
                    },
                },
                capture,
            );
            expect(lowered(2)).toBe(3);
            expect(() => lowered(0)).toThrow(hostError);
            await guest._util.whenIdle();
            expect(guest.run(4)).toBe(13);
            guest._util.stop();
            expect(() => lowered(2)).toThrow(/stopped/);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('module-mode imports can read instance flags during and after initialization', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-sync-module-'));
        try {
            await writeFile(join(dir, 'host.mjs'), 'export default n => n + 1;');
            const { files } = await transpileBytes(leaf, { name: 'leaf', map: { host: './host.mjs' } });
            await writeFiles(files, { baseDir: dir });
            const instance = await import(pathToFileURL(join(dir, 'leaf.js')).href);
            expect(instance.run(3)).toBe(12);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('captured host resources preserve identity across handle reuse, explicit reps and stop', async () => {
        const component = new TextEncoder().encode(`(component
        (import "api" (instance $api (export "thing" (type (sub resource)))))
        (alias export $api "thing" (type $thing))
        (import "make" (func $make (result (own $thing))))
        (import "value" (func $value (param "thing" (borrow $thing)) (result u32)))
        (core func $make (canon lower (func $make)))
        (core func $value (canon lower (func $value)))
        (core func $drop (canon resource.drop $thing))
        (core module $m
            (import "" "make" (func $make (result i32)))
            (import "" "value" (func $value (param i32) (result i32)))
            (import "" "drop" (func $drop (param i32)))
            (func (export "make") (result i32) (call $make))
            (func (export "read") (param i32) (result i32) (call $value (local.get 0)))
            (func (export "drop") (param i32) (call $drop (local.get 0))))
        (core instance $i (instantiate $m (with "" (instance
            (export "make" (func $make)) (export "value" (func $value)) (export "drop" (func $drop))))))
        (func (export "acquire") (result u32) (canon lift (core func $i "make")))
        (func (export "read") (param "h" u32) (result u32) (canon lift (core func $i "read")))
        (func (export "release") (param "h" u32) (canon lift (core func $i "drop"))))`);
        class Thing {
            disposals = 0;
            onDispose?: () => void;
            constructor(readonly value: number) {}
            [Symbol.dispose]() {
                this.disposals++;
                this.onDispose?.();
            }
        }

        const dir = await mkdtemp(join(tmpdir(), 'jco-captured-resource-'));
        try {
            const { files } = await transpileBytes(component, { name: 'capture', instantiation: 'async' });
            await writeFiles(files, { baseDir: dir });
            const { instantiate } = await import(pathToFileURL(join(dir, 'capture.js')).href);
            const first = new Thing(1);
            const later = new Thing(2);
            const explicit = Object.assign(new Thing(3), { [Symbol.for('cabiRep')]: -1 });
            let next = first;
            const imports = {
                api: { Thing },
                make: { default: () => next },
                value: { default: (t: Thing) => t.value },
            };
            const guest = await instantiate(undefined, imports);
            const handle = guest.acquire();
            const alias = guest.acquire();
            guest.release(handle);
            expect(first.disposals).toBe(1);
            next = later;
            const reused = guest.acquire();
            expect(reused).toBe(handle);
            next = explicit;
            const custom = guest.acquire();
            expect([alias, reused, custom].map((h) => guest.read(h))).toEqual([1, 2, 3]);
            guest._util.stop();
            expect([first.disposals, later.disposals, explicit.disposals]).toEqual([1, 1, 1]);

            // An explicit rep can replace a still-live automatic capture.
            const collidingGuest = await instantiate(undefined, imports);
            next = new Thing(5);
            const original = collidingGuest.acquire();
            next = Object.assign(new Thing(6), { [Symbol.for('cabiRep')]: 1 });
            const replacement = collidingGuest.acquire();
            expect(collidingGuest.read(original)).toBe(6);
            expect(collidingGuest.read(replacement)).toBe(6);
            collidingGuest._util.stop();
            expect(next.disposals).toBe(1);

            // An out-of-range u32 must not alias a live handle through a wrapping index.
            const invalidBorrow = await instantiate(undefined, imports);
            const live = invalidBorrow.acquire();
            expect(() => invalidBorrow.read(live + 2 ** 31)).toThrow(WebAssembly.RuntimeError);

            const freedBorrow = await instantiate(undefined, imports);
            const freed = freedBorrow.acquire();
            freedBorrow.release(freed);
            expect(() => freedBorrow.read(freed)).toThrow(WebAssembly.RuntimeError);

            const trapping = await instantiate(undefined, imports);
            next = new Thing(9);
            next.onDispose = () => {
                throw new RangeError('host disposer');
            };
            const doomed = trapping.acquire();
            expect(() => trapping.release(doomed)).toThrow(/out of bounds memory access/);
            expect(() => trapping.acquire()).toThrow(WebAssembly.RuntimeError);
            expect(next.disposals).toBe(1);

            // A disposer can stop a store while it still owns another alias.
            const other = await instantiate(undefined, imports);
            next = new Thing(4);
            const dropping = other.acquire();
            other.acquire();
            next.onDispose = () => other._util.stop();
            expect(() => other.release(dropping)).toThrow(/instance has been stopped/);
            expect(next.disposals).toBe(1);

            // Even looking up the hook can reenter shutdown. While the getter
            // runs, the second live handle refers to the object being dropped.
            const reentrant = await instantiate(undefined, imports);
            next = new Thing(7);
            const handleToDrop = reentrant.acquire();
            reentrant.acquire();
            Object.defineProperty(next, Symbol.dispose, {
                get() {
                    reentrant._util.stop();
                    return Thing.prototype[Symbol.dispose];
                },
            });
            expect(() => reentrant.release(handleToDrop)).toThrow(/instance has been stopped/);
            expect(next.disposals).toBe(1);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('an optional resource can grow memory between discriminant and handle stores', async () => {
        const component = new TextEncoder().encode(`(component
        (import "api" (instance $api (export "item" (type (sub resource)))))
        (alias export $api "item" (type $item))
        (import "get" (func $get (result (option (own $item)))))
        (core module $storage (memory (export "memory") 1 2))
        (core instance $storage (instantiate $storage))
        (alias core export $storage "memory" (core memory $memory))
        (core func $get (canon lower (func $get) (memory $memory)))
        (core func $drop (canon resource.drop $item))
        (core module $guest
            (import "" "memory" (memory 1))
            (import "" "get" (func $get (param i32)))
            (import "" "drop" (func $drop (param i32)))
            (func (export "run") (result i32)
                (call $get (i32.const 16))
                (call $drop (i32.load (i32.const 20)))
                (memory.size)))
        (core instance $guest (instantiate $guest (with "" (instance
            (export "memory" (memory $memory)) (export "get" (func $get)) (export "drop" (func $drop))))))
        (func (export "run") (result u32) (canon lift (core func $guest "run"))))`);
        let memory!: WebAssembly.Memory;
        let disposals = 0;
        class Item {
            get [Symbol.for('cabiRep')]() {
                expect(new DataView(memory.buffer).getUint8(16)).toBe(1);
                memory.grow(1);
                return undefined;
            }
            [Symbol.dispose]() {
                disposals++;
            }
        }
        const dir = await mkdtemp(join(tmpdir(), 'jco-sync-memory-'));
        try {
            const { files } = await transpileBytes(component, { name: 'growth', instantiation: 'async' });
            await writeFiles(files, { baseDir: dir });
            const { instantiate } = await import(pathToFileURL(join(dir, 'growth.js')).href);
            const guest = await instantiate(
                undefined,
                { api: { Item }, get: { default: () => new Item() } },
                (module: WebAssembly.Module, imports: WebAssembly.Imports) => {
                    const core = new WebAssembly.Instance(module, imports);
                    if (core.exports.memory instanceof WebAssembly.Memory) {
                        memory = core.exports.memory;
                    }
                    return core;
                },
            );
            expect(guest.run()).toBe(2);
            expect(disposals).toBe(1);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('a synchronous string result survives guest memory growth at its exact UTF-8 size', async () => {
        const component = new TextEncoder().encode(`(component
        (import "text" (func $text (result string)))
        (core module $storage
            (memory (export "mem") 1)
            (global $size (mut i32) (i32.const 0))
            (func (export "size") (result i32) (global.get $size))
            (func (export "allocate") (param i32 i32 i32) (param $n i32) (result i32)
                (global.set $size (local.get $n))
                (i32.shl (memory.grow (i32.shr_u (i32.add (local.get $n) (i32.const 65535))
                    (i32.const 16))) (i32.const 16))))
        (core instance $storage (instantiate $storage))
        (alias core export $storage "mem" (core memory $mem))
        (alias core export $storage "allocate" (core func $allocate))
        (core func $read (canon lower (func $text) (memory $mem) (realloc $allocate)))
        (core module $guest
            (import "" "read" (func $read (param i32)))
            (func (export "run") (result i32) (call $read (i32.const 0)) (i32.const 0)))
        (core instance $guest (instantiate $guest (with "" (instance (export "read" (func $read))))))
        (func (export "run") (result string) (canon lift (core func $guest "run") (memory $mem)))
        (func (export "size") (result u32) (canon lift (core func $storage "size"))))`);
        const dir = await mkdtemp(join(tmpdir(), 'jco-sync-utf8-'));
        try {
            const { files } = await transpileBytes(component, { name: 'strings', instantiation: 'async' });
            await writeFiles(files, { baseDir: dir });
            const { instantiate } = await import(pathToFileURL(join(dir, 'strings.js')).href);
            let value = '';
            const guest = await instantiate(undefined, { text: { default: () => value } });
            const encoder = new TextEncoder();
            const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
            for (value of ['x'.repeat(16384), '\ufeffaé漢😀\ud800'.repeat(2048), '漢'.repeat(100000), 'short']) {
                const bytes = encoder.encode(value);
                expect(guest.run()).toBe(decoder.decode(bytes));
                expect(guest.size()).toBe(bytes.length);
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('a synchronous realloc cannot call an imported host function', async () => {
        const component = new TextEncoder().encode(`(component
        (import "host" (func $host))
        (core func $host (canon lower (func $host)))
        (core module $core
            (import "" "host" (func $host))
            (memory (export "memory") 1)
            (func (export "alloc") (param i32 i32 i32 i32) (result i32)
                (call $host) (i32.const 64))
            (func (export "consume") (param i32 i32)))
        (core instance $guest (instantiate $core (with "" (instance (export "host" (func $host))))))
        (func (export "consume") (param "text" string)
            (canon lift (core func $guest "consume") (memory (core memory $guest "memory"))
                        (realloc (core func $guest "alloc")))))`);
        const dir = await mkdtemp(join(tmpdir(), 'jco-sync-realloc-'));
        try {
            const { files } = await transpileBytes(component, { name: 'guard', instantiation: 'async' });
            await writeFiles(files, { baseDir: dir });
            const { instantiate } = await import(pathToFileURL(join(dir, 'guard.js')).href);
            let calls = 0;
            const guest = await instantiate(undefined, { host: { default: () => calls++ } });
            expect(() => guest.consume('hello')).toThrow(/cannot leave component instance/);
            expect(calls).toBe(0);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
