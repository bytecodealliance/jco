// Run separately so removing the global does not affect the transpiler or other tests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(process.argv[2]);
const native = globalThis.WebAssembly;
class CustomRuntimeError extends Error {}
const wasm = Object.assign(Object.create(native), { RuntimeError: CustomRuntimeError });
const options = { shim: { globals: { WebAssembly: wasm } } };
const load = (name) => new native.Module(readFileSync(new URL(name, moduleUrl)));

delete globalThis.WebAssembly;
const { instantiate } = await import(moduleUrl);

async function checkRuntime() {
    const instance = await instantiate(load, {}, undefined, options);
    assert.equal(instance.run(42), 42);
    assert.throws(() => instance.invalid(0), {
        constructor: CustomRuntimeError,
        message: 'unknown handle index 1',
    });
    assert.throws(() => instance.run(24), {
        constructor: CustomRuntimeError,
        message: 'wasm trap: cannot enter component instance',
    });
}

await checkRuntime();
Object.defineProperty(globalThis, 'WebAssembly', {
    get() {
        throw new Error('accessed the platform WebAssembly');
    },
});
await checkRuntime();
