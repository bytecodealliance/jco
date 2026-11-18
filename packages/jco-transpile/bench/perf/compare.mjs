/**
 * Compare variants built by `gen.mjs`, interleaving fresh processes so that
 * machine noise affects each variant alike.
 *
 * usage: node compare.mjs [--runs=N] [--filter=text] <baseline> <variant>...
 *
 * Prints median nanoseconds per call, the observed range, and median speedups.
 */
import { execFileSync } from 'node:child_process';
import { summarize } from './statistics.mjs';
import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values, positionals: variants } = parseArgs({
    options: { runs: { type: 'string', default: '5' }, filter: { type: 'string', default: '' } },
    allowPositionals: true,
});
const runs = Number(values.runs);
const filter = values.filter;
const bench = fileURLToPath(new URL('./bench.mjs', import.meta.url));

if (!Number.isInteger(runs) || runs < 1 || variants.length < 2 || new Set(variants).size !== variants.length) {
    throw new Error('usage: node compare.mjs [--runs=positive-integer] [--filter=text] <baseline> <variant>...');
}

/** Retain every process's warmed samples for each case and variant. */
const observations = new Map(variants.map((variant) => [variant, {}]));
for (let run = 0; run < runs; run++) {
    const order = [...variants.slice(run % variants.length), ...variants.slice(0, run % variants.length)];
    for (const variant of order) {
        const output = execFileSync(process.execPath, [bench, variant, filter], { encoding: 'utf8' });
        const results = JSON.parse(output.trim().split('\n').at(-1));
        for (const [name, { samples }] of Object.entries(results)) {
            (observations.get(variant)[name] ??= []).push(...samples);
        }
    }
}

/** Render the median and full observed range, all in ns/call. */
const format = ({ median, min, max }) => `${median.toFixed(1)} [${min.toFixed(1)}, ${max.toFixed(1)}]`;

const [baseline, ...others] = variants;
const header = ['case', baseline, ...others.flatMap((variant) => [variant, 'speedup'])];
console.log(`| ${header.join(' | ')} |`);
console.log(`|${header.map(() => '---').join('|')}|`);
for (const name of Object.keys(observations.get(baseline))) {
    const base = summarize(observations.get(baseline)[name]);
    const cells = others.flatMap((variant) => {
        const value = summarize(observations.get(variant)[name]);
        return [format(value), `${(base.median / value.median).toFixed(2)}x`];
    });
    console.log(`| ${[name, format(base), ...cells].join(' | ')} |`);
}

console.log(
    JSON.stringify({
        node: process.version,
        v8: process.versions.v8,
        cpu: cpus()[0]?.model,
        runs,
        baseline,
        variants,
        observations: Object.fromEntries(observations),
    }),
);
