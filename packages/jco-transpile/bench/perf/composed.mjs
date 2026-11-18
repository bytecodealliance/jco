/**
 * Time calls that cross between two components with a memory each.
 *
 * usage: node composed.mjs <variant-name>...
 *
 * Each variant holds the `echo-composed` fixture, whose calls copy their value
 * through a fused adapter. Without `--multi-memory` the adapter reaches the second
 * memory through imported JavaScript functions, one call per scalar.
 * Prints the nanoseconds per call for each variant, the fastest of several
 * rounds that alternate between the variants.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const variants = process.argv.slice(2);
const rounds = 9;

const cases = {
    'string, 16 chars': ['run', 'abcdefghijklmnop', 20_000],
    'string, 4096 chars': ['run', 'abcdefghijklmnop'.repeat(256), 5_000],
    'list<u32>, 4 elements': ['runList', new Uint32Array(4).map((_, index) => index), 20_000],
    'list<u32>, 256 elements': ['runList', new Uint32Array(256).map((_, index) => index), 2_000],
    'list<u32>, 4096 elements': ['runList', new Uint32Array(4096).map((_, index) => index), 200],
};

/**
 * Time one round of calls on the bindings of one variant.
 *
 * @param {(value: unknown) => unknown} call - export of the `echo-composed` fixture
 * @param {unknown} value - argument of every call
 * @param {number} iterations - calls in the round
 * @returns {number} nanoseconds per call
 */
function time(call, value, iterations) {
    const start = performance.now();
    for (let index = 0; index < iterations; index++) {
        call(value);
    }
    return ((performance.now() - start) * 1e6) / iterations;
}

const loaded = [];
for (const variant of variants) {
    const url = new URL(`../output/perf/${variant}/echo-composed/echo-composed.js`, import.meta.url);
    loaded.push({ variant, bindings: await import(url.href) });
}

const rows = {};
for (const [name, [fn, value, iterations]] of Object.entries(cases)) {
    const best = Object.fromEntries(variants.map((variant) => [variant, Infinity]));

    // Check the result and warm the call up before timing it.
    for (const { bindings } of loaded) {
        assert.deepEqual(bindings[fn](value), value);
        time(bindings[fn], value, iterations);
    }

    for (let round = 0; round < rounds; round++) {
        for (const { variant, bindings } of loaded) {
            best[variant] = Math.min(best[variant], time(bindings[fn], value, iterations));
        }
    }
    rows[name] = Object.fromEntries(variants.map((variant) => [variant, Math.round(best[variant])]));
}
console.table(rows);
