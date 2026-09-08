// Run from this checkout with its dependencies installed and a JSPI-capable Node.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../packages/jco/package.json', import.meta.url));
const { componentize } = await import(
    new URL('../../packages/jco/node_modules/@bytecodealliance/componentize-js/src/componentize.js', import.meta.url)
);
const { transpileBytes } = await import(require.resolve('@bytecodealliance/jco-transpile'));
const { WASIShim } = await import(require.resolve('@bytecodealliance/preview2-shim/instantiation'));
const mode = process.argv[2] ?? 'broken';
const cases = {
    globals: {
        wit: `package repro:globals;
world test { export run: func() -> string; }`,
        source: `export function run() {
    const controller = new AbortController();
    const combined = AbortSignal.any([controller.signal]);
    controller.abort("stopped");
    return JSON.stringify({
        webAssembly: typeof WebAssembly,
        directReason: controller.signal.reason,
        combinedReason: combined.reason,
    });
}`,
    },
    broken: {
        wit: `package repro:callbacks;
interface callbacks { resource listener { call: func() -> u32; } }
interface host {
    use callbacks.{listener};
    invoke: func(value: own<listener>) -> u32;
}
world test { import host; export callbacks; export run: func() -> u32; }`,
        source: `import { invoke } from "repro:callbacks/host";
class Listener { call() { return 42; } }
export const callbacks = { Listener };
export function run() { return invoke(new Listener()); }`,
    },
    imported: {
        wit: `package repro:callbacks;
interface callbacks { resource listener { call: func() -> u32; } }
interface host {
    use callbacks.{listener};
    make: func() -> own<listener>;
    invoke: func(value: own<listener>) -> u32;
}
world test { import host; export callbacks; export run: func() -> u32; }`,
        source: `import { make, invoke } from "repro:callbacks/host";
class Listener { call() { return 42; } }
export const callbacks = { Listener };
export function run() { return invoke(make()); }`,
    },
    dispatch: {
        wit: `package repro:dispatch;
interface host { register: func(id: u32); }
world test {
    import host;
    export start: func();
    export dispatch: func(id: u32) -> option<u32>;
    export release: func(id: u32);
}`,
        source: `import { register } from "repro:dispatch/host";
const callbacks = new Map();
let nextId = 1;
function add(callback) {
    const id = nextId++;
    callbacks.set(id, callback);
    register(id);
}
export function start() {
    let count = 41;
    add(() => ++count);
    add(() => 70);
}
export function dispatch(id) { return callbacks.get(id)?.(); }
export function release(id) { callbacks.delete(id); }`,
    },
};
const selected = cases[mode];
if (!selected) {
    throw new Error(`Choose ${Object.keys(cases).join(', ')}`);
}
const dir = await mkdtemp(join(tmpdir(), `jco-${mode}-`));
console.log(`Artifacts: ${dir}`);
await writeFile(join(dir, 'source.js'), selected.source);
await writeFile(join(dir, 'source.wit'), selected.wit);
const { component } = await componentize({ sourcePath: join(dir, 'source.js'), witPath: join(dir, 'source.wit') });
await writeFile(join(dir, 'component.wasm'), component);
const { files } = await transpileBytes(component, { name: 'repro', instantiation: 'async' });
await writeFile(join(dir, 'package.json'), '{"type":"module"}\n');
for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), content);
}
const { instantiate } = await import(pathToFileURL(join(dir, 'repro.js')));
const imports = new WASIShim().getImportObject();
const ids = [];
class HostListener {
    call() {
        return 99;
    }
}
if (mode === 'broken' || mode === 'imported') {
    imports['repro:callbacks/callbacks'] = { Listener: HostListener };
    imports['repro:callbacks/host'] = {
        make: () => new HostListener(),
        invoke: (listener) => listener.call(),
    };
}
if (mode === 'dispatch') {
    imports['repro:dispatch/host'] = { register: (id) => ids.push(id) };
}
const instance = await instantiate(undefined, imports);
if (mode === 'broken') {
    assert.throws(() => instance.run(), /unknown handle index 1|Invalid handle/);
    console.log('Reproduced: guest-created Listener is not a valid imported resource.');
} else if (mode === 'imported') {
    assert.equal(instance.run(), 99);
    console.log('Control passed: host-created imported Listener roundtrips and returns 99.');
} else if (mode === 'globals') {
    console.log(instance.run());
} else {
    instance.start();
    assert.deepEqual(ids, [1, 2]);
    // Call only after start returns; do not synchronously re-enter from register.
    assert.equal(instance.dispatch(ids[0]), 42);
    assert.equal(instance.dispatch(ids[0]), 43);
    assert.equal(instance.dispatch(ids[1]), 70);
    instance.release(ids[0]);
    assert.equal(instance.dispatch(ids[0]), undefined);
    assert.equal(instance.dispatch(ids[1]), 70);
    instance.release(ids[1]);
    assert.equal(instance.dispatch(ids[1]), undefined);
    console.log('Dispatch passed: guest closure state, isolation, and explicit release.');
}
