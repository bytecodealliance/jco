import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { transpile, writeFiles } from '../../transpilation.js';
import { parse } from '../../../src/wasm-tools.js';
import { runBrowserCase } from '../../helpers.js';
import { withBrowser } from './helpers.js';

const CASE_MODULE = '/jco-transpile/test/external-runtime/browser/cases.js';
const CUSTOM_RUNTIME = new URL('../../fixtures/custom-runtime/', import.meta.url);
const RESOURCE_COMPONENT = new URL(
    '../../fixtures/components/runtime/external-runtime-resource.component.wat',
    import.meta.url,
);

suite('external runtime browser', () => {
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
        test.concurrent.each(['sync-lowered-async-callee', 'deferred-subtask-start'])(
            `browser drives ${provider} named host calls: %s`,
            async (name) => {
                await withBrowser(async (browser, serverPort, outDir) => {
                    const { files } = await transpile(
                        fileURLToPath(new URL(`../../fixtures/components/p3/${name}.wat`, import.meta.url)),
                        {
                            name: 'host',
                            instantiation: 'sync',
                            asyncMode: 'jspi',
                            nodejsCompat: false,
                            base64Cutoff: 0,
                            cmRuntimeEsModule:
                                provider === 'default' ? '@bytecodealliance/jco-cm-runtime' : './runtime/',
                        },
                    );
                    await writeFiles(files, { baseDir: outDir });
                    if (provider === 'custom') {
                        await cp(CUSTOM_RUNTIME, join(outDir, 'runtime'), { recursive: true });
                    }
                    const deferred = name === 'deferred-subtask-start';
                    const result = await runBrowserCase({
                        browser,
                        serverPort,
                        module: CASE_MODULE,
                        exportName: 'runHost',
                        args: [
                            {
                                componentPath: '/tmpdir/host.js',
                                corePaths: Object.keys(files).filter((path) => path.endsWith('.wasm')),
                                deferred,
                            },
                        ],
                    });
                    assert.deepEqual(result, {
                        values: deferred
                            ? [
                                  [1, 0],
                                  [1, 0],
                              ]
                            : [42, 42],
                        completed: deferred ? [2, 2] : [],
                    });
                });
            },
        );

        test.concurrent(`transpiles and loads ${provider} named exports entirely in the browser`, async () => {
            await withBrowser(async (browser, serverPort, outDir) => {
                await writeFile(
                    join(outDir, 'component.wasm'),
                    await parse(await readFile(RESOURCE_COMPONENT, 'utf8')),
                );
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
});
