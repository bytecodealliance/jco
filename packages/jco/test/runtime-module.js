import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, test, vi } from 'vitest';

// Jco depends on the last published jco-transpile release. Exercise the local
// implementation while testing this branch's Jco integration.
vi.mock('@bytecodealliance/jco-transpile', async () => import('../../jco-transpile/src/index.js'));

import { transpile } from '../src/api.js';
import { transpileCmd } from '../src/cmd/transpile.js';
import { getTmpDir } from './helpers.js';

const fixture = fileURLToPath(
    new URL('../../jco-transpile/test/fixtures/components/runtime/resources.2.component.wat', import.meta.url),
);
const runtimeModule = 'test-runtime-provider';
const runtimeFixture = new URL('../../jco-transpile/test/fixtures/custom-runtime-provider.js', import.meta.url);

async function installRuntimeInConsumer(dir) {
    const packageDir = join(dir, 'node_modules', runtimeModule);
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: runtimeModule, type: 'module' }));
    await copyFile(runtimeFixture, join(packageDir, 'index.js'));
    const provider = await import(pathToFileURL(join(packageDir, 'index.js')).href);
    provider.resetRuntimeCreateCallCount();
    return provider;
}

async function instantiateFromDir(dir, name) {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    const bindings = await import(pathToFileURL(join(dir, `${name}.js`)).href);
    bindings.instantiate((moduleName) => new WebAssembly.Module(readFileSync(join(dir, moduleName))), {});
}

describe('custom Component Model runtime', () => {
    test('neither Jco package depends on the optional runtime', async () => {
        for (const path of ['../package.json', '../../jco-transpile/package.json']) {
            const manifest = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
            expect(manifest.dependencies).not.toHaveProperty('@bytecodealliance/jco-cm-runtime');
        }
    });

    test('the API imports a caller-supplied runtime only in generated bindings', async () => {
        const dir = await getTmpDir();
        const name = 'runtime-api';

        try {
            const provider = await installRuntimeInConsumer(dir);
            const { files } = await transpile(await readFile(fixture), {
                name,
                instantiation: 'sync',
                runtimeModule,
            });
            for (const [filename, bytes] of Object.entries(files)) {
                await mkdir(dirname(join(dir, filename)), { recursive: true });
                await writeFile(join(dir, filename), bytes);
            }
            const source = await readFile(join(dir, `${name}.js`), 'utf8');
            expect(source).toContain(`from "${runtimeModule}"`);
            await instantiateFromDir(dir, name);
            expect(provider.runtimeCreateCallCount).toBe(1);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('the command handler forwards runtimeModule to generated bindings', async () => {
        const dir = await getTmpDir();
        const name = 'runtime-cli';

        try {
            const provider = await installRuntimeInConsumer(dir);
            await transpileCmd(fixture, {
                name,
                outDir: dir,
                instantiation: 'sync',
                runtimeModule,
                quiet: true,
            });
            const source = await readFile(join(dir, `${name}.js`), 'utf8');
            expect(source).toContain(`from "${runtimeModule}"`);
            await instantiateFromDir(dir, name);
            expect(provider.runtimeCreateCallCount).toBe(1);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
