/**
 * Time lowering a string as UTF-8 with the runtime alone, no guest involved.
 *
 * usage: node string-lower.mjs <runtime-dist-dir>...
 *
 * Each directory is a build of the Component Model runtime (`packages/jco-cm-runtime/dist`).
 * `bench.mjs` only lowers one short ASCII string; this covers lengths and kinds of text.
 * Prints the nanoseconds per string for each build, the fastest of several
 * rounds that alternate between the builds.
 */
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const rounds = 12;
const lengths = [8, 32, 64, 128, 256, 1024, 16384];

/** One repeated unit per kind of text; `mostly ASCII` has one two-byte character in sixteen. */
const units = {
    ASCII: 'a',
    'mostly ASCII': 'abcdefghijklmnoé',
    'two-byte': 'é',
    'three-byte': '中',
    'four-byte': '🚀',
};

const builds = [];
for (const dir of process.argv.slice(2)) {
    const string = await import(pathToFileURL(resolve(dir, 'debug/intrinsics/string.js')).href);
    builds.push({ dir, string, encoder: string.initializeUtf8Encoder() });
}

// The allocation is fixed, so that only the runtime's own work is timed.
const memory = new WebAssembly.Memory({ initial: 4 });
const realloc = () => 1024;

let sink = 0;
const rows = {};
for (const [kind, unit] of Object.entries(units)) {
    for (const length of lengths) {
        const text = unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
        const iterations = Math.max(200, Math.floor(2_000_000 / (length + 20)));
        const best = builds.map(() => Infinity);

        for (let round = 0; round < rounds; round++) {
            for (const [index, { string, encoder }] of builds.entries()) {
                const start = performance.now();
                for (let iteration = 0; iteration < iterations; iteration++) {
                    sink += string.utf8Encode(encoder, text, realloc, memory).len;
                }
                best[index] = Math.min(best[index], ((performance.now() - start) * 1e6) / iterations);
            }
        }
        rows[`${kind}, ${length} code units`] = Object.fromEntries(
            builds.map(({ dir }, index) => [dir, Math.round(best[index])]),
        );
    }
}
console.table(rows);

// Keep the results observable, so that the calls are not optimized away.
if (sink < 0) {
    console.log(sink);
}
