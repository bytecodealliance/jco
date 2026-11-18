/**
 * Time calls of one component instance while more and more instances share a runtime.
 *
 * usage: node sharing.mjs <variant-name> [instances]
 *
 * Each instance is a separate evaluation of the same bindings module. With an
 * external runtime they share its functions; with an embedded runtime each has
 * its own. Prints the nanoseconds per call of the first instance after each
 * further instance has been exercised, for a scalar export and for an export
 * whose guest code makes 39 host import calls.
 */
import { performance } from 'node:perf_hooks';

const variant = process.argv[2];
const instances = Number(process.argv[3] ?? 6);

/** The calls to time, with how many of each make one round. */
const calls = {
    exportNs: [(bindings) => bindings.test.roundtripU32(42), 50_000],
    importsNs: [(bindings) => bindings.testImports(), 1_000],
};

/**
 * Time every kind of call on one instance.
 *
 * @param {object} bindings - module namespace of one instance
 * @returns {Record<string, number>} nanoseconds per call, the fastest of several rounds
 */
function time(bindings) {
    const result = {};
    for (const [name, [call, iterations]] of Object.entries(calls)) {
        let best = Infinity;
        for (let round = 0; round < 5; round++) {
            const start = performance.now();
            for (let index = 0; index < iterations; index++) {
                call(bindings);
            }
            best = Math.min(best, ((performance.now() - start) * 1e6) / iterations);
        }
        result[name] = Math.round(best);
    }
    return result;
}

const base = new URL(`../output/perf/${variant}/numbers/numbers.js`, import.meta.url).href;
const first = await import(`${base}?instance=0`);
time(first);

const timings = [time(first)];
for (let index = 1; index < instances; index++) {
    const other = await import(`${base}?instance=${index}`);
    time(other);
    timings.push(time(first));
}
console.log(
    JSON.stringify({
        variant,
        exportNs: timings.map((timing) => timing.exportNs),
        importsNs: timings.map((timing) => timing.importsNs),
    }),
);
