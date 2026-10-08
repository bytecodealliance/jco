// Checks that transpiled instantiation output uses an injected WebAssembly
// implementation rather than the platform global.
//
// This runs in its own process so that it can remove the platform global
// without interfering with other tests or with the transpiler itself.
//
// Usage: node custom-webassembly.mjs <transpiled-module-path> <async|sync>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [modulePath, instantiation] = process.argv.slice(2);
assert.ok(modulePath, 'usage: custom-webassembly.mjs <transpiled-module-path> <async|sync>');
assert.ok(['async', 'sync'].includes(instantiation), `unknown instantiation mode '${instantiation}'`);
const moduleUrl = pathToFileURL(modulePath);
const isAsync = instantiation === 'async';

const native = globalThis.WebAssembly;
delete globalThis.WebAssembly;
const { instantiate } = await import(moduleUrl);

const used = new Set();
const wasm = new Proxy(native, {
    get(target, key) {
        used.add(key);
        return target[key];
    },
});
const override = { shim: { globals: { WebAssembly: wasm } } };
const load = (name) =>
    name.includes('.conditional-suspending-') ? undefined : new native.Module(readFileSync(new URL(name, moduleUrl)));

// Every WebAssembly API the component touches must come from the override.
const result = instantiate(load, {}, undefined, override);
if (!isAsync) {
    assert.ok(!(result instanceof Promise));
}
const instance = await result;
assert.equal(instance.run(), 42);
for (const key of ['Module', 'Instance', 'Global', 'Suspending']) {
    assert.ok(used.has(key), `${key} must use the injected implementation`);
}
assert.equal(used.has('instantiate'), isAsync);

// An explicit core instantiator still takes precedence over the default.
used.clear();
let calls = 0;
const custom = await instantiate(
    load,
    {},
    (module, imports) => {
        calls++;
        return new native.Instance(module, imports);
    },
    override,
);
assert.equal(custom.run(), 42);
assert.equal(calls, 2);
assert.ok(!used.has('instantiate'));

// The default async loader must also compile through the override.
if (isAsync) {
    used.clear();
    const loaded = await instantiate(undefined, {}, undefined, override);
    assert.equal(loaded.run(), 42);
    assert.ok(used.has('compile'));
}
assert.equal(globalThis.WebAssembly, undefined);

// The default core instantiator must call the implementation as a method, so
// that custom implementations may rely on `this`.
if (isAsync) {
    let receiver;
    const method = Object.assign(Object.create(native), {
        instantiate(module, imports) {
            receiver = this;
            return native.instantiate(module, imports);
        },
    });
    const viaMethod = await instantiate(load, {}, undefined, { shim: { globals: { WebAssembly: method } } });
    assert.equal(viaMethod.run(), 42);
    assert.equal(receiver, method);
}

// Without any implementation, the default core instantiator fails clearly.
for (const options of [undefined, null, { shim: { globals: { WebAssembly: null } } }]) {
    assert.throws(() => instantiate(load, {}, undefined, options), {
        message: /no WebAssembly implementation is available/,
    });
}

// Even feature detection must use the injected object.
Object.defineProperty(globalThis, 'WebAssembly', {
    get() {
        throw new Error('accessed the platform WebAssembly');
    },
});
const isolated = await instantiate(load, {}, undefined, override);
assert.equal(isolated.run(), 42);
