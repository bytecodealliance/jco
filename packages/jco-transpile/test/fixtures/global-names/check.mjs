import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [modulePath] = process.argv.slice(2);
assert.ok(modulePath, 'usage: check.mjs <transpiled-module-path>');
const moduleUrl = pathToFileURL(modulePath);
const { instantiate } = await import(moduleUrl);

/** Compile a core module relative to the generated bindings. */
function load(name) {
    return new WebAssembly.Module(readFileSync(new URL(name, moduleUrl)));
}

/** A host function that the bindings must not call in place of a global. */
function hostOnly(name) {
    return () => assert.fail(`the bindings called the host import '${name}'`);
}

/** A host resource that the bindings must not construct in place of a global. */
class HostResource {
    constructor() {
        assert.fail('the bindings constructed a host resource');
    }
}

// The imports are named after globals that the bindings and their runtime use.
const instance = await instantiate(load, {
    'test:names/host': {
        Map: HostResource,
        Set: HostResource,
        Symbol: HostResource,
        Number: HostResource,
        WeakSet: HostResource,
        console: hostOnly('console'),
        setTimeout: hostOnly('set-timeout'),
        queueMicrotask: hostOnly('queue-microtask'),
    },
});

// The guest calls none of its imports, so only the bindings could reach them.
assert.equal(instance.pushContext(42), 42);
assert.equal(instance.pullContext(), 0);
