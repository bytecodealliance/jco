import { expect, test } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from './helpers.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const conformance = fileURLToPath(new URL('../../../scripts/test-jco-cm-runtime-release.mjs', import.meta.url));

test('each profile retains contracts and eliminates only its selected labels', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jco-runtime-profiles-'));
    try {
        for (const profile of ['checked', 'debug', 'unchecked']) {
            const output = join(directory, profile);
            await exec(process.execPath, ['scripts/build.mjs', '--profile', profile, '--out-dir', output], {
                cwd: root,
            });
            await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
            const files = (await readdir(output, { recursive: true })).filter((name) => name.endsWith('.js'));
            const code = (await Promise.all(files.map((name) => readFile(join(output, name), 'utf8')))).join('\n');
            expect(code.includes('[contextGet()] args')).toBe(profile === 'debug');
            expect(code.includes('[RepTable#insert()] args')).toBe(profile === 'debug');
            expect(code.includes('corrupt rep table freelist')).toBe(profile !== 'unchecked');
            expect(await readFile(join(output, 'runtime.d.ts'), 'utf8')).toContain('CM_RUNTIME_API_VERSION');
            const result = await exec(process.execPath, [conformance, '--runtime-base', output], { cwd: root });
            expect(result.stdout).toContain('CM runtime conformance passed');
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 120_000);

test('the package holds the checked profile with the others beside it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jco-runtime-package-'));
    try {
        await exec(process.execPath, ['scripts/build.mjs', '--out-dir', directory], { cwd: root });

        /** Read every JavaScript module below one directory of the build, except other profiles. */
        const read = async (subdirectory: string) => {
            const base = join(directory, subdirectory);
            const files = (await readdir(base, { recursive: true })).filter(
                (name) => name.endsWith('.js') && !/^(debug|unchecked)[\\/]/.test(name),
            );
            return (await Promise.all(files.map((name) => readFile(join(base, name), 'utf8')))).join('\n');
        };

        for (const [subdirectory, diagnostics, assertions] of [
            ['.', false, true],
            ['debug', true, true],
            ['unchecked', false, false],
        ] as const) {
            const code = await read(subdirectory);
            expect(code.includes('[RepTable#insert()] args'), subdirectory).toBe(diagnostics);
            expect(code.includes('corrupt rep table freelist'), subdirectory).toBe(assertions);
            expect(await readFile(join(directory, subdirectory, 'intrinsics/core.js'), 'utf8')).toBeTruthy();
        }
        expect(await readFile(join(directory, 'runtime.d.ts'), 'utf8')).toContain('CM_RUNTIME_API_VERSION');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 120_000);
