import { copyFile, cp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, test, vi } from 'vitest';

// Jco depends on the last published jco-transpile release. Exercise the local
// implementation while testing this branch's Jco integration.
vi.mock('@bytecodealliance/jco-transpile', async () => import('../../jco-transpile/src/index.js'));

import { transpile } from '../src/api.js';
import { transpileCmd } from '../src/cmd/transpile.js';
import { exec, getTmpDir } from './helpers.js';

const fixture = fileURLToPath(
    new URL('../../jco-transpile/test/fixtures/components/runtime/resources.2.component.wat', import.meta.url),
);
const runtimeModule = 'test-runtime-provider';
const runtimeFixture = new URL('../../jco-transpile/test/fixtures/custom-runtime-provider.js', import.meta.url);
const jcoPackageDir = fileURLToPath(new URL('../', import.meta.url));
const localTranspilerDir = fileURLToPath(new URL('../../jco-transpile/', import.meta.url));

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

async function installCliWithLocalTranspiler(dir) {
    const installDir = join(dir, 'jco-install');
    await mkdir(installDir);
    await cp(join(jcoPackageDir, 'dist'), join(installDir, 'dist'), { recursive: true });
    await cp(join(jcoPackageDir, 'lib'), join(installDir, 'lib'), { recursive: true });
    await copyFile(join(jcoPackageDir, 'package.json'), join(installDir, 'package.json'));

    const manifest = JSON.parse(await readFile(join(jcoPackageDir, 'package.json'), 'utf8'));
    for (const name of Object.keys(manifest.dependencies)) {
        const source =
            name === '@bytecodealliance/jco-transpile'
                ? localTranspilerDir
                : await realpath(join(jcoPackageDir, 'node_modules', name));
        const destination = join(installDir, 'node_modules', name);
        await mkdir(dirname(destination), { recursive: true });
        await symlink(source, destination, process.platform === 'win32' ? 'junction' : 'dir');
    }
    return join(installDir, 'dist', 'jco.js');
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

    test('the CLI uses a local transpiler and a runtime installed only with its output', async () => {
        const root = await getTmpDir();
        const dir = join(root, 'output');
        const name = 'runtime-cli-e2e';

        try {
            await mkdir(dir);
            const jcoCli = await installCliWithLocalTranspiler(root);
            const provider = await installRuntimeInConsumer(dir);
            await exec(
                jcoCli,
                'transpile',
                fixture,
                '--name',
                name,
                '--out-dir',
                dir,
                '--instantiation',
                'sync',
                '--runtime-module',
                runtimeModule,
            );
            const source = await readFile(join(dir, `${name}.js`), 'utf8');
            expect(source).toContain(`from "${runtimeModule}"`);
            await instantiateFromDir(dir, name);
            expect(provider.runtimeCreateCallCount).toBe(1);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
