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

/** A host function that the runtime must not call in place of a global. */
function hostOnly(name) {
    return () => assert.fail(`the runtime called the host import '${name}'`);
}

/** A host resource that the runtime must not construct in place of a global. */
class HostResource {
    constructor() {
        assert.fail('the runtime constructed a host resource');
    }
}

// The imports are named after globals that the runtime uses, so the bindings
// declare local names for them that would shadow those globals in their scope.
const instance = await instantiate(load, {
    'test:scope/host': {
        WeakSet: HostResource,
        Symbol: HostResource,
        Number: HostResource,
        setTimeout: hostOnly('set-timeout'),
        queueMicrotask: hostOnly('queue-microtask'),
    },
});

// The guest calls none of its imports, so only the runtime could reach them.
assert.equal(instance.pushContext(42), 42);
assert.equal(instance.pullContext(), 0);
