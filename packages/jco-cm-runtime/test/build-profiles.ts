import { expect, test } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from './helpers.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const conformance = fileURLToPath(new URL('../../../scripts/test-jco-cm-runtime-release.mjs', import.meta.url));

test('release and lean bundles retain contracts and eliminate their selected labels', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jco-runtime-profiles-'));
    try {
        for (const profile of ['release', 'lean']) {
            const output = join(directory, profile);
            await exec(process.execPath, ['scripts/build.mjs', '--profile', profile, '--out-dir', output], {
                cwd: root,
            });
            await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
            const files = (await readdir(output, { recursive: true })).filter((name) => name.endsWith('.js'));
            const code = (await Promise.all(files.map((name) => readFile(join(output, name), 'utf8')))).join('\n');
            expect(code).not.toContain('[contextGet()] args');
            expect(code).not.toContain('[RepTable#insert()] args');
            expect(code.includes('corrupt rep table freelist')).toBe(profile === 'release');
            expect(await readFile(join(output, 'runtime.d.ts'), 'utf8')).toContain('CM_RUNTIME_API_VERSION');
            const result = await exec(process.execPath, [conformance, '--runtime-base', output], { cwd: root });
            expect(result.stdout).toContain('CM runtime conformance passed');
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 60_000);
