import { expect, test } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from './helpers.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const conformance = fileURLToPath(new URL('../../../scripts/test-jco-cm-runtime-release.mjs', import.meta.url));

/** Check source navigation after output has moved and staging has been removed. */
async function expectSourceMaps(directory: string) {
    const files = await readdir(directory, { recursive: true });
    const maps = files.filter((name) => name.endsWith('.d.ts.map') || name.endsWith('.js.map'));
    expect(maps.some((name) => name.endsWith('.js.map'))).toBe(true);
    expect(maps.length).toBeGreaterThan(0);
    for (const name of maps) {
        const filename = join(directory, name);
        const map = JSON.parse(await readFile(filename, 'utf8')) as { sources: string[]; sourceRoot?: string };
        for (const source of map.sources) {
            const target = resolve(dirname(filename), map.sourceRoot ?? '', source);
            expect(target.startsWith(join(root, 'src')), name).toBe(true);
            expect(await readFile(target, 'utf8'), name).not.toBe('');
        }
    }
}

test('each profile retains contracts and eliminates only its selected labels', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jco-runtime-profiles-'));
    try {
        for (const profile of ['checked', 'debug']) {
            const output = join(directory, profile);
            await exec(process.execPath, ['scripts/build.mjs', '--profile', profile, '--out-dir', output], {
                cwd: root,
            });
            await expectSourceMaps(output);
            await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
            const files = (await readdir(output, { recursive: true })).filter((name) => name.endsWith('.js'));
            const code = (await Promise.all(files.map((name) => readFile(join(output, name), 'utf8')))).join('\n');
            expect(code.includes('[contextGet()] args')).toBe(profile === 'debug');
            expect(code.includes('[RepTable#insert()] args')).toBe(profile === 'debug');
            expect(code).toContain('corrupt rep table freelist');
            expect(await readFile(join(output, 'runtime.d.ts'), 'utf8')).toContain('CM_RUNTIME_API_VERSION');
            const result = await exec(process.execPath, [conformance, '--runtime-base', output], { cwd: root });
            expect(result.stdout).toContain('CM runtime conformance passed');
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 120_000);

test('the package holds the checked profile with the debug profile beside it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jco-runtime-package-'));
    try {
        await exec(process.execPath, ['scripts/build.mjs', '--out-dir', directory], { cwd: root });

        /** Read every JavaScript module below one directory of the build, except the profile beside it. */
        const read = async (subdirectory: string) => {
            const base = join(directory, subdirectory);
            const files = (await readdir(base, { recursive: true })).filter(
                (name) => name.endsWith('.js') && !/^debug[\\/]/.test(name),
            );
            return (await Promise.all(files.map((name) => readFile(join(base, name), 'utf8')))).join('\n');
        };

        for (const [subdirectory, diagnostics, assertions] of [
            ['.', false, true],
            ['debug', true, true],
        ] as const) {
            const code = await read(subdirectory);
            expect(code.includes('[RepTable#insert()] args'), subdirectory).toBe(diagnostics);
            expect(code.includes('corrupt rep table freelist'), subdirectory).toBe(assertions);
            expect(await readFile(join(directory, subdirectory, 'intrinsics/core.js'), 'utf8')).toBeTruthy();
        }
        await expectSourceMaps(directory);
        expect(await readFile(join(directory, 'runtime.d.ts'), 'utf8')).toContain('CM_RUNTIME_API_VERSION');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 120_000);
