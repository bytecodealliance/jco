/**
 * Compare variants built by `gen.sh`, interleaving fresh processes so that
 * machine noise affects each variant alike.
 *
 * usage: node compare.mjs [--runs=N] [--filter=text] <baseline> <variant>...
 *
 * Prints nanoseconds per call for each case (the fastest observation of each
 * variant) and each variant's speedup over the baseline.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) =>
    args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const runs = Number(option('runs', 5));
const filter = option('filter', '');
const variants = args.filter((value) => !value.startsWith('--'));
const bench = fileURLToPath(new URL('./bench.mjs', import.meta.url));

/** Fastest observation of each case, per variant. */
const best = new Map(variants.map((variant) => [variant, {}]));
for (let run = 0; run < runs; run++) {
    for (const variant of variants) {
        const output = execFileSync(process.execPath, [bench, variant, filter], { encoding: 'utf8' });
        const results = JSON.parse(output.trim().split('\n').at(-1));
        for (const [name, nanoseconds] of Object.entries(results)) {
            best.get(variant)[name] = Math.min(best.get(variant)[name] ?? Infinity, nanoseconds);
        }
    }
}

const [baseline, ...others] = variants;
const header = ['case', baseline, ...others.flatMap((variant) => [variant, 'speedup'])];
console.log(`| ${header.join(' | ')} |`);
console.log(`|${header.map(() => '---').join('|')}|`);
for (const name of Object.keys(best.get(baseline))) {
    const base = best.get(baseline)[name];
    const cells = others.flatMap((variant) => {
        const value = best.get(variant)[name];
        return [value, `${(base / value).toFixed(2)}x`];
    });
    console.log(`| ${[name, base, ...cells].join(' | ')} |`);
}
