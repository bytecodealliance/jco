import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer, { type Browser } from 'puppeteer';
import { afterAll, assert, beforeAll, expect, suite, test } from 'vitest';

import { transpile, writeFiles } from '../../transpilation.js';
import { parse } from '../../../src/wasm-tools.js';
import { getTmpDir, runBrowserCase, startTestWebServer } from '../../helpers.js';

const CASE_MODULE = '/jco-transpile/test/external-runtime/browser/cases.js';
const CUSTOM_PROVIDER = new URL('../../fixtures/custom-runtime-provider.js', import.meta.url);
const RESOURCE_COMPONENT = new URL(
    '../../fixtures/components/runtime/external-runtime-resource.component.wat',
    import.meta.url,
);

suite('External Component Model runtime in the browser', () => {
    let browser: Browser;
    let serverPort: number;
    let closeServer: (() => Promise<void>) | undefined;
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await getTmpDir();
        const server = await startTestWebServer({
            routes: [
                { urlPrefix: '/tmpdir/', basePathURL: pathToFileURL(`${tmpDir}/`) },
                { basePathURL: new URL('../../../../', import.meta.url) },
            ],
        });
        serverPort = server.serverPort;
        closeServer = server.cleanup;
        browser = await puppeteer.launch({
            executablePath: env.PUPPETEER_PATH,
            args: [
                '--enable-experimental-webassembly-jspi',
                '--flag-switches-begin',
                '--enable-features=WebAssemblyExperimentalJSPI',
                '--flag-switches-end',
            ],
        });
    });

    afterAll(async () => {
        await browser?.close();
        await closeServer?.();
        if (tmpDir) {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });

    for (const provider of ['default', 'custom'] as const) {
        for (const instantiation of ['sync', 'async', undefined] as const) {
            test.each([false, true])(
                `runs with the ${provider} provider (${instantiation ?? 'direct'}, minify=%s)`,
                async (minify) => {
                    const name = `${provider}-${instantiation ?? 'direct'}-${minify}`;
                    const outDir = join(tmpDir, name);
                    const { files } = await transpile(fileURLToPath(RESOURCE_COMPONENT), {
                        name: 'component',
                        instantiation,
                        minify,
                        nodejsCompat: false,
                        base64Cutoff: 0,
                        cmRuntimeEsModule:
                            provider === 'default' ? '@bytecodealliance/jco-cm-runtime' : './provider.js',
                    });
                    await writeFiles(files, { baseDir: outDir });
                    if (provider === 'custom') {
                        await copyFile(CUSTOM_PROVIDER, join(outDir, 'provider.js'));
                    }
                    const result = await runBrowserCase({
                        browser,
                        serverPort,
                        module: CASE_MODULE,
                        exportName: 'runComponent',
                        args: [
                            {
                                componentPath: `/tmpdir/${name}/component.js`,
                                corePaths: Object.keys(files).filter((path) => path.endsWith('.wasm')),
                                instantiation,
                                providerPath: provider === 'custom' ? `/tmpdir/${name}/provider.js` : undefined,
                            },
                        ],
                    });
                    assert.deepEqual(result, expectedResult(provider, !!instantiation));
                },
            );
        }

        test(`transpiles and runs with the ${provider} provider entirely in the browser`, async () => {
            const componentPath = `/tmpdir/${provider}.wasm`;
            await writeFile(join(tmpDir, `${provider}.wasm`), await parse(await readFile(RESOURCE_COMPONENT, 'utf8')));
            const result = await runBrowserCase({
                browser,
                serverPort,
                module: CASE_MODULE,
                exportName: 'transpileInBrowser',
                args: [
                    {
                        componentPath,
                        cmRuntimeEsModule:
                            provider === 'default'
                                ? '@bytecodealliance/jco-cm-runtime'
                                : '/jco-transpile/test/fixtures/custom-runtime-provider.js',
                        providerPath:
                            provider === 'custom'
                                ? '/jco-transpile/test/fixtures/custom-runtime-provider.js'
                                : undefined,
                    },
                ],
            });
            assert.deepEqual(result, expectedResult(provider, true));
        });
    }

    test.each([
        {
            kind: 'provider',
            provider: '{ apiVersion: 2, create() { throw new Error("factory must not run"); } }',
            error: 'runtime API: requested 1, supported 2',
        },
        {
            kind: 'instance',
            provider: '{ apiVersion: 1, create() { return { apiVersion: 2 }; } }',
            error: 'runtime API instance: requested 1, received 2',
        },
    ])('rejects an incompatible $kind API version', async ({ kind, provider, error }) => {
        const name = `invalid-${kind}`;
        const outDir = join(tmpDir, name);
        const { files } = await transpile(fileURLToPath(RESOURCE_COMPONENT), {
            name: 'component',
            nodejsCompat: false,
            cmRuntimeEsModule: './provider.js',
        });
        await writeFiles(files, { baseDir: outDir });
        await writeFile(join(outDir, 'provider.js'), `export const runtime = ${provider};`);
        await expect(
            runBrowserCase({
                browser,
                serverPort,
                module: CASE_MODULE,
                exportName: 'runComponent',
                args: [{ componentPath: `/tmpdir/${name}/component.js` }],
            }),
        ).rejects.toThrow(error);
    });
});

function expectedResult(provider: 'default' | 'custom', explicitInstantiation: boolean) {
    return {
        values: [42, 24],
        invalidHandle: { runtimeError: true, message: 'unknown handle index 0' },
        afterTrap: { runtimeError: true, message: 'wasm trap: cannot enter component instance' },
        siblingValue: explicitInstantiation ? 7 : null,
        runtimeCreates: provider === 'custom' ? (explicitInstantiation ? 2 : 1) : null,
        tableGets: provider === 'custom' ? 2 : null,
    };
}
