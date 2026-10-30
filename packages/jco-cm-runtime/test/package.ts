import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, suite, test } from 'vitest';

import { exec, runPnpm } from './helpers.js';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const consumerFixture = new URL('./fixtures/package-consumer/', import.meta.url);
const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin/tsc');

suite('runtime package', () => {
    // Build once before exercising consumers so artifact replacement cannot race imports.
    test.concurrent('packed exports, standalone declarations, and independent provider conformance', async () => {
        const consumer = await mkdtemp(join(tmpdir(), 'jco-runtime-consumer-'));
        try {
            await cp(consumerFixture, consumer, { recursive: true });
            await runPnpm(
                ['--config.verify-deps-before-run=false', 'pack', '--pack-destination', consumer],
                packageRoot,
            );
            const tarball = (await readdir(consumer)).find((name) => name.endsWith('.tgz'))!;
            await runPnpm(
                [
                    '--ignore-workspace',
                    'install',
                    '--offline',
                    '--ignore-scripts',
                    '--lockfile=false',
                    join(consumer, tarball),
                ],
                consumer,
            );
            await cp(
                new URL('../../../scripts/test-jco-cm-runtime-release.mjs', import.meta.url),
                join(consumer, 'smoke.mjs'),
            );
            await cp(
                new URL('../../../scripts/cm-runtime-conformance/', import.meta.url),
                join(consumer, 'cm-runtime-conformance'),
                { recursive: true },
            );
            await exec(process.execPath, ['smoke.mjs'], { cwd: consumer });

            const installed = join(consumer, 'node_modules/@bytecodealliance/jco-cm-runtime');
            await cp(installed, join(consumer, 'node_modules/test-runtime-alias'), {
                recursive: true,
                dereference: true,
            });
            await exec(process.execPath, ['conformance.mjs'], { cwd: consumer });
            await exec(process.execPath, ['smoke.mjs', '--runtime-base', 'test-runtime-alias', '--group', 'resource'], {
                cwd: consumer,
            });
            await exec(
                process.execPath,
                [
                    'smoke.mjs',
                    '--runtime-base',
                    './node_modules/test-runtime-alias/dist',
                    '--group',
                    'runtime',
                    '--group',
                    'resource',
                ],
                { cwd: consumer },
            );
            expect((await exec(process.execPath, ['smoke.mjs', '--help'], { cwd: consumer })).stdout).toContain(
                'Available groups:',
            );
            const contract = await readFile(join(installed, 'dist/runtime.d.ts'), 'utf8');
            expect(contract).not.toMatch(/\b(?:import|from)\s*['"({]/);
            const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
            expect(Object.keys(manifest.exports).sort()).toEqual(['.', './intrinsics/resource', './runtime']);
            expect(manifest.sideEffects).toBe(false);
            const rust = await readFile(
                new URL('../../../crates/js-component-bindgen/src/intrinsics/ext.rs', import.meta.url),
                'utf8',
            );
            expect(rust).toContain('CM_RUNTIME_API_VERSION: u32 = 1;');

            // The independent provider needs only the published declaration, without private files.
            await writeFile(join(consumer, 'contract.d.ts'), contract);
            for (const mode of ['NodeNext', 'Bundler']) {
                await exec(process.execPath, [tsc, '-p', `tsconfig.${mode.toLowerCase()}.json`], { cwd: consumer });
                expect((await readFile(join(consumer, `out-${mode}/types-only.js`), 'utf8')).trim()).toBe('export {};');
                await exec(process.execPath, [`out-${mode}/consumer.js`], { cwd: consumer });
            }
            await exec(process.execPath, ['minimal.mjs'], { cwd: consumer });
        } finally {
            await rm(consumer, { recursive: true, force: true });
        }
    }, 60_000);
});
