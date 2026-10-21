import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer, { type Browser } from 'puppeteer';
import { assert, test } from 'vitest';

import { transpile, writeFiles } from '../../../src/index.js';
import { parse } from '../../../src/wasm-tools.js';
import { getTmpDir, runBrowserCase, startTestWebServer } from '../../helpers.js';

const CASE_MODULE = '/jco-transpile/test/external-runtime/browser/cases.js';
const CUSTOM_RUNTIME = new URL('../../fixtures/custom-runtime/', import.meta.url);
const RESOURCE_COMPONENT = new URL(
    '../../fixtures/components/runtime/external-runtime-resource.component.wat',
    import.meta.url,
);

async function withBrowser(run: (browser: Browser, serverPort: number, outDir: string) => Promise<void>) {
    const outDir = await getTmpDir();
    let browser: Browser | undefined;
    let closeServer: (() => Promise<void>) | undefined;
    try {
        const server = await startTestWebServer({
            routes: [
                { urlPrefix: '/tmpdir/', basePathURL: pathToFileURL(`${outDir}/`) },
                { basePathURL: new URL('../../../../', import.meta.url) },
            ],
        });
        closeServer = server.cleanup;
        browser = await puppeteer.launch({ executablePath: env.PUPPETEER_PATH });
        await run(browser, server.serverPort, outDir);
    } finally {
        await browser?.close();
        await closeServer?.();
        await rm(outDir, { recursive: true, force: true });
    }
}

for (const provider of ['default', 'custom', 'url'] as const) {
    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.concurrent.each([false, true])(
            `browser loads ${provider} named exports (${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                await withBrowser(async (browser, serverPort, outDir) => {
                    const cmRuntimeEsModule =
                        provider === 'default'
                            ? '@bytecodealliance/jco-cm-runtime'
                            : provider === 'custom'
                              ? './runtime/'
                              : `http://localhost:${serverPort}/jco-cm-runtime/dist/`;
                    const { files } = await transpile(fileURLToPath(RESOURCE_COMPONENT), {
                        name: 'component',
                        instantiation,
                        minify,
                        nodejsCompat: false,
                        base64Cutoff: 0,
                        cmRuntimeEsModule,
                    });
                    await writeFiles(files, { baseDir: outDir });
                    if (provider === 'custom') {
                        await cp(CUSTOM_RUNTIME, join(outDir, 'runtime'), { recursive: true });
                    }
                    const result = await runBrowserCase({
                        browser,
                        serverPort,
                        module: CASE_MODULE,
                        exportName: 'runComponent',
                        args: [
                            {
                                componentPath: '/tmpdir/component.js',
                                corePaths: Object.keys(files).filter((path) => path.endsWith('.wasm')),
                                instantiation,
                                providerPath:
                                    provider === 'custom' ? '/tmpdir/runtime/intrinsics/resource.js' : undefined,
                            },
                        ],
                    });
                    assert.deepEqual(result, expectedResult(provider === 'custom', !!instantiation));
                });
            },
        );
    }
}

for (const provider of ['default', 'custom'] as const) {
    test.concurrent(`transpiles and loads ${provider} named exports entirely in the browser`, async () => {
        await withBrowser(async (browser, serverPort, outDir) => {
            await writeFile(join(outDir, 'component.wasm'), await parse(await readFile(RESOURCE_COMPONENT, 'utf8')));
            const result = await runBrowserCase({
                browser,
                serverPort,
                module: CASE_MODULE,
                exportName: 'transpileInBrowser',
                args: [
                    {
                        componentPath: '/tmpdir/component.wasm',
                        cmRuntimeEsModule:
                            provider === 'default'
                                ? '@bytecodealliance/jco-cm-runtime'
                                : '/jco-transpile/test/fixtures/custom-runtime/',
                        providerPath:
                            provider === 'custom'
                                ? '/jco-transpile/test/fixtures/custom-runtime/intrinsics/resource.js'
                                : undefined,
                    },
                ],
            });
            assert.deepEqual(result, expectedResult(provider === 'custom', true));
        });
    });
}

function expectedResult(custom: boolean, explicit: boolean) {
    return {
        values: [42, 24],
        invalidHandle: { runtimeError: true, message: 'unknown handle index 0' },
        afterTrap: { runtimeError: true, message: 'wasm trap: cannot enter component instance' },
        siblingValue: explicit ? 7 : null,
        contexts: custom ? (explicit ? 2 : 1) : null,
        tableGets: custom ? 2 : null,
    };
}
