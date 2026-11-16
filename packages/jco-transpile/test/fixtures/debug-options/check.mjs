import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [modulePath, instantiation] = process.argv.slice(2);
assert.ok(modulePath, 'usage: check.mjs <transpiled-module-path> <sync|async>');
assert.ok(['sync', 'async'].includes(instantiation), `unknown instantiation mode '${instantiation}'`);
const moduleUrl = pathToFileURL(modulePath);
const originalDebug = console.debug;
const originalEnvironment = process.env.JCO_DEBUG;
const messages = [];
console.debug = (...args) => messages.push(args);

try {
    process.env.JCO_DEBUG = '';
    const { instantiate } = await import(moduleUrl);
    const modules = new Map();

    /** Load and cache a compiled core module relative to the generated bindings. */
    function load(name) {
        if (!modules.has(name)) {
            modules.set(name, new WebAssembly.Module(readFileSync(new URL(name, moduleUrl))));
        }
        return modules.get(name);
    }

    process.env.JCO_DEBUG = '1';
    const quietOptions = { debug: false };
    const quiet = await instantiate(load, {}, undefined, quietOptions);
    const verbose = await instantiate(load, {}, undefined, { debug: true });
    const fromEnvironment = await instantiate(load, {});
    process.env.JCO_DEBUG = '';
    const defaultQuiet = await instantiate(load, {});
    quietOptions.debug = true;

    // Options and the environment are snapshots, and alternating calls must
    // not change another instance's logging configuration.
    for (const instance of [quiet, defaultQuiet, verbose, quiet, fromEnvironment, defaultQuiet]) {
        messages.length = 0;
        assert.equal(instance.pushContext(42), 42);
        assert.equal(instance.pullContext(), 0);
        if (instance === verbose || instance === fromEnvironment) {
            assert.ok(
                messages.some(
                    ([message, details]) =>
                        message === '[contextGet()] args' && details !== null && typeof details === 'object',
                ),
                'enabled instances log context access',
            );
        } else {
            assert.equal(messages.length, 0, 'disabled instances do not log');
        }
    }

    if (instantiation === 'async') {
        const options = { debug: false };
        const pending = instantiate(async (name) => load(name), {}, undefined, options);
        options.debug = true;
        process.env.JCO_DEBUG = '1';
        const instance = await pending;
        messages.length = 0;
        assert.equal(instance.pushContext(9), 9);
        assert.equal(messages.length, 0, 'configuration is captured before asynchronous loading');
    }
} finally {
    console.debug = originalDebug;
    if (originalEnvironment === undefined) {
        delete process.env.JCO_DEBUG;
    } else {
        process.env.JCO_DEBUG = originalEnvironment;
    }
}
