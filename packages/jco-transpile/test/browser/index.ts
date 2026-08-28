import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { env } from 'node:process';
import { pathToFileURL } from 'node:url';

import { componentize } from '@bytecodealliance/componentize-js';
import puppeteer, { type Browser } from 'puppeteer';
import { afterAll, assert, beforeAll, suite, test } from 'vitest';

import { transpileBytes, writeFiles } from '../../src/index.js';
import { WEBIDL_FIXTURES_DIR, COMPONENT_FIXTURES_DIR } from '../common.js';
import { getTmpDir, setupAsyncTest, startTestWebServer } from '../helpers.js';

const HARNESS_PATH = 'jco-transpile/test/fixtures/browser/harness.html';
const TRANSPILE_CASE_MODULE = '/jco-transpile/test/fixtures/browser/transpile.js';
const JSPI_CASE_MODULE = '/jco-transpile/test/fixtures/browser/jspi.js';
const RUNTIME_COMPONENTS_URL = '/jco-transpile/test/fixtures/components/runtime';

/**
 * Components transpiled by the in-browser transpilation test.
 *
 * Each one is transpiled, evaluated and instantiated against the preview2-shim browser
 * build. This covers running bindgen in a browser rather than codegen correctness, which
 * codegen.ts already covers for every fixture in Node, so the default is a small set picked
 * for distinct component shapes rather than every fixture on disk.
 *
 * As elsewhere in the suite, COMPONENT_FIXTURES can be set to a comma-separated list of
 * file names to transpile a different set.
 */
const DEFAULT_BROWSER_COMPONENTS = [
    'lists.component.wasm',
    'records.component.wasm',
    'resources.component.wasm',
    'flavorful.component.wasm',
    'results.component.wasm',
    'many_arguments.component.wasm',
];

const BROWSER_COMPONENTS = (env.COMPONENT_FIXTURES?.split(',') ?? DEFAULT_BROWSER_COMPONENTS)
    .map((name) => name.trim())
    // NOTE: bindgen takes binary components, so WAT fixtures cannot be used here
    .filter((name) => name.endsWith('.wasm'));

suite('Browser', () => {
    let browser: Browser;
    let serverPort: number;
    let closeServer: () => Promise<void>;
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await getTmpDir();
        const server = await startTestWebServer({
            routes: [
                { urlPrefix: '/tmpdir/', basePathURL: pathToFileURL(`${tmpDir}/`) },
                { basePathURL: new URL('../../../', import.meta.url) },
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
        await rm(tmpDir, { recursive: true, force: true });
    });

    test('transpiles and instantiates components in the browser', async () => {
        assert.isNotEmpty(BROWSER_COMPONENTS, 'no components selected for browser transpilation');

        // NOTE: all components are handled by a single page, so the bindgen component
        // is only fetched and instantiated once for the whole set
        const results = (await runBrowserCase({
            module: TRANSPILE_CASE_MODULE,
            exportName: 'transpile',
            args: [BROWSER_COMPONENTS.map((name) => `${RUNTIME_COMPONENTS_URL}/${name}`)],
        })) as { path: string; ok: boolean; exports?: string[]; error?: string }[];

        const failures = results.filter((result) => !result.ok);
        assert.deepStrictEqual(
            failures.map(({ path }) => path),
            [],
            `failed in the browser:\n${failures.map(({ path, error }) => `  ${path}: ${error}`).join('\n')}`,
        );
        assert.deepStrictEqual(
            results.map(({ path }) => path),
            BROWSER_COMPONENTS.map((name) => `${RUNTIME_COMPONENTS_URL}/${name}`),
            'not every selected component was reported on',
        );
        for (const { path, exports } of results) {
            assert.isNotEmpty(exports, `instantiating [${path}] produced no exports`);
        }
    });

    for (const fixture of ['dom', 'console']) {
        test(`runs the ${fixture} Web IDL component`, async () => {
            const { component } = await componentize({
                sourcePath: join(WEBIDL_FIXTURES_DIR, `${fixture}.test.js`),
                disableFeatures: ['clocks', 'random', 'stdio'],
                witPath: join(WEBIDL_FIXTURES_DIR, `${fixture}.wit`),
                worldName: `${fixture === 'dom' ? 'window' : fixture}-test`,
            });
            const outDir = resolve(tmpDir, fixture);
            const { files } = await transpileBytes(component, { name: fixture });
            await writeFiles(files, { baseDir: outDir });
            await runBrowserCase({ module: `/tmpdir/${fixture}/${fixture}.js` });
        });
    }

    test('runs an asynchronous component with JSPI', async () => {
        const outputDir = resolve(tmpDir, 'jspi');
        await mkdir(outputDir);
        const component = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async_call',
                path: join(COMPONENT_FIXTURES_DIR, 'runtime/async_call.component.wasm'),
                outputDir,
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncImports: ['something:test/test-interface#call-async'],
                        asyncExports: ['run-async'],
                    },
                },
            },
        });
        try {
            const value = await runBrowserCase({
                module: JSPI_CASE_MODULE,
                exportName: 'jspi',
                args: [`/tmpdir/jspi/async_call/async_call.js`],
            });
            assert.deepStrictEqual(value, { responseText: 'callAsync' });
        } finally {
            await component.cleanup();
        }
    });

    async function runBrowserCase({
        module,
        exportName = 'test',
        args = [],
    }: {
        module: string;
        exportName?: string;
        args?: unknown[];
    }) {
        const page = await browser.newPage();
        const diagnostics: string[] = [];
        page.on('console', (message) => diagnostics.push(`console.${message.type()}: ${message.text()}`));
        page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.stack ?? error.message}`));
        page.on('requestfailed', (request) =>
            diagnostics.push(`requestfailed: ${request.failure()?.errorText} ${request.url()}`),
        );

        try {
            const params = new URLSearchParams({ module, export: exportName, args: JSON.stringify(args) });
            const url = `http://localhost:${serverPort}/${HARNESS_PATH}#${params}`;
            const response = await page.goto(url);
            assert.ok(response?.ok(), `failed to load ${url}: HTTP ${response?.status()}`);
            const result = await page.evaluate(() => window.__jcoTest);
            if (!result.ok) {
                assert.fail(
                    [`${result.error.name}: ${result.error.message}`, result.error.stack, ...diagnostics]
                        .filter(Boolean)
                        .join('\n'),
                );
            }
            if (env.JCO_DEBUG && diagnostics.length) {
                console.log(diagnostics.join('\n'));
            }
            return result.value;
        } finally {
            await page.close();
        }
    }
});

declare global {
    interface Window {
        __jcoTest: Promise<
            { ok: true; value: unknown } | { ok: false; error: { name: string; message: string; stack?: string } }
        >;
    }
}
