import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { transpile, writeFiles } from '../../transpilation.js';
import { parse } from '../../../src/wasm-tools.js';
import { runBrowserCase } from '../../helpers.js';
import { withBrowser } from './helpers.js';
import { writeCustomRuntime } from '../helpers.js';

const CASE_MODULE = '/jco-transpile/test/external-runtime/browser/cases.js';
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
                            await writeCustomRuntime(join(outDir, 'runtime'));
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
                await writeFile(
                    join(outDir, 'component.wasm'),
                    await parse(await readFile(RESOURCE_COMPONENT, 'utf8')),
                );
                if (provider === 'custom') {
                    await writeCustomRuntime(join(outDir, 'runtime'));
                }
                const result = await runBrowserCase({
                    browser,
                    serverPort,
                    module: CASE_MODULE,
                    exportName: 'transpileInBrowser',
                    args: [
                        {
                            componentPath: '/tmpdir/component.wasm',
                            cmRuntimeEsModule:
                                provider === 'default' ? '@bytecodealliance/jco-cm-runtime' : '/tmpdir/runtime/',
                            providerPath: provider === 'custom' ? '/tmpdir/runtime/intrinsics/resource.js' : undefined,
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
