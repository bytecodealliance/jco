import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const exec = promisify(execFile);
const profiles = { development: [], release: ['DEBUG'], lean: ['DEBUG', 'SAFETY'] };

/** Build declarations and optionally bundle a diagnostic-stripped runtime with shared chunks. */
export async function build({ profile = 'development', outDir = join(root, 'dist') } = {}) {
    if (!Object.hasOwn(profiles, profile)) {
        throw new Error(`unknown runtime profile: ${profile}`);
    }
    outDir = resolve(outDir);
    const staging = await mkdtemp(join(root, '.runtime-build-'));
    try {
        const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
        await exec(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json'), '--outDir', staging]);
        if (profile === 'development') {
            await rm(outDir, { recursive: true, force: true });
            await cp(staging, outDir, { recursive: true });
            return;
        }
        const { rolldown } = await import('rolldown');
        const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
        const input = Object.fromEntries(
            Object.entries(manifest.exports).map(([name, target]) => [
                name === '.' ? 'index' : name.slice(2),
                join(staging, target.default.slice('./dist/'.length)),
            ]),
        );
        const bundle = await rolldown({
            input,
            platform: 'neutral',
            external: [/^node:/],
            // Remove labels while they still exist, before tree shaking and minification.
            transform: { dropLabels: profiles[profile] },
        });
        try {
            // Generating first avoids reading from the destination being replaced.
            const { output } = await bundle.generate({
                format: 'esm',
                minify: true,
                sourcemap: true,
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js',
            });
            await rm(outDir, { recursive: true, force: true });
            await mkdir(outDir, { recursive: true });
            for (const item of output) {
                const path = join(outDir, item.fileName);
                await mkdir(dirname(path), { recursive: true });
                await writeFile(path, item.type === 'chunk' ? item.code : item.source);
            }
            for (const name of await readdir(staging, { recursive: true })) {
                if (/\.d\.ts(?:\.map)?$/.test(name)) {
                    const path = join(outDir, name);
                    await mkdir(dirname(path), { recursive: true });
                    await cp(join(staging, name), path);
                }
            }
        } finally {
            await bundle.close();
        }
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { values } = parseArgs({
        options: {
            profile: { type: 'string', default: 'development' },
            'out-dir': { type: 'string', default: join(root, 'dist') },
        },
    });
    await build({ profile: values.profile, outDir: values['out-dir'] });
}
