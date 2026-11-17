/**
 * Time calls through generated bindings of one variant built by `gen.sh`.
 *
 * usage: node bench.mjs <variant-name> [case-filter]
 *
 * Prints one JSON object mapping each case to its nanoseconds per call (the
 * fastest of several rounds, each taken after warm-up).
 */
import { performance } from 'node:perf_hooks';

const variant = process.argv[2];
const filter = process.argv[3];
if (!variant) {
    throw new Error('usage: node bench.mjs <variant-name> [case-filter]');
}

/**
 * Import the bindings of one fixture of the variant.
 *
 * @param {string} name - fixture name
 * @returns {Promise<object>} the module namespace of the bindings
 */
const load = (name) => import(new URL(`../output/perf/${variant}/${name}/${name}.js`, import.meta.url).href);

const [numbers, strings, lists, records] = await Promise.all(['numbers', 'strings', 'lists', 'records'].map(load));

const bytes = new Uint8Array(64).map((_, index) => index);
const record = { a: 8, b: { b0: true, b1: false, b2: true } };
const text = 'hello world, this is a string';

/** Benchmark cases: the function to time and how many calls make one round. */
const cases = {
    'export u32 -> u32': [() => numbers.test.roundtripU32(42), 100_000],
    'export f64 -> f64': [() => numbers.test.roundtripF64(1.5), 100_000],
    'export string -> string': [() => strings.roundtrip(text), 30_000],
    'export list<u8> -> list<u8>': [() => lists.test.listRoundtrip(bytes), 20_000],
    'export record -> record': [() => records.test.roundtripRecord1(record), 20_000],
    'export tuple swap': [() => records.test.swapTuple([1, 2]), 20_000],
    'guest calls 39 numeric imports': [() => numbers.testImports(), 1_000],
    'guest calls 2 string imports': [() => strings.testImports(), 10_000],
};

const results = {};
for (const [name, [fn, iterations]] of Object.entries(cases)) {
    if (filter && !name.includes(filter)) {
        continue;
    }

    // Let the optimizing compiler settle before timing.
    for (let index = 0; index < iterations; index++) {
        fn();
    }

    const rounds = [];
    for (let round = 0; round < 5; round++) {
        const start = performance.now();
        for (let index = 0; index < iterations; index++) {
            fn();
        }
        rounds.push(((performance.now() - start) * 1e6) / iterations);
    }
    results[name] = Math.round(Math.min(...rounds));
}
console.log(JSON.stringify(results));
