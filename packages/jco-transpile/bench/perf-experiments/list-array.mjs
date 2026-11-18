/**
 * Time lowering a plain array of numbers as a `list<u8>`, which checks every element.
 *
 * usage: node list-array.mjs <variant-name>...
 *
 * `bench.mjs` passes a `Uint8Array`, which is copied without a check per element.
 * Prints the nanoseconds per call for each variant, the fastest of several
 * rounds that alternate between the variants.
 */
import { performance } from 'node:perf_hooks';

const variants = process.argv.slice(2);
const values = Array.from({ length: 64 }, (_, index) => index);
const iterations = 20_000;
const rounds = 7;

/**
 * Time one round of calls on the bindings of one variant.
 *
 * @param {object} bindings - module namespace of the `lists` fixture
 * @returns {number} nanoseconds per call
 */
function time(bindings) {
    const start = performance.now();
    for (let index = 0; index < iterations; index++) {
        bindings.test.listRoundtrip(values);
    }
    return ((performance.now() - start) * 1e6) / iterations;
}

const loaded = [];
for (const variant of variants) {
    const url = new URL(`../output/perf/${variant}/lists/lists.js`, import.meta.url);
    loaded.push({ variant, bindings: await import(url.href), best: Infinity });
}

for (let round = 0; round < rounds; round++) {
    for (const entry of loaded) {
        entry.best = Math.min(entry.best, time(entry.bindings));
    }
}
console.log(JSON.stringify(Object.fromEntries(loaded.map((entry) => [entry.variant, Math.round(entry.best)]))));
