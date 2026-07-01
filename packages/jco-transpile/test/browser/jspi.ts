import { join } from 'node:path';
import { env } from 'node:process';

import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

import { suite, test, assert } from 'vitest';

import { setupAsyncTest, startTestWebServer, loadTestPage } from '../helpers.js';
import { AsyncFunction, COMPONENT_FIXTURES_DIR } from '../common.js';

suite(`Async`, async () => {
    const componentPath = join(COMPONENT_FIXTURES_DIR, 'runtime/async_call.component.wasm');

    test('Transpile async (browser, JSPI)', { retry: 3 }, async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }
        const componentName = 'async-call';
        const {
            instance,
            cleanup: componentCleanup,
            outputDir,
        } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async_call',
                path: componentPath,
                imports: {
                    'something:test/test-interface': {
                        callAsync: async () => 'called async',
                        callSync: () => 'called sync',
                    },
                },
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
        const moduleName = componentName.toLowerCase().replaceAll('-', '_');
        const moduleRelPath = `${moduleName}/${moduleName}.js`;

        assert.strictEqual(instance.runSync instanceof AsyncFunction, false, 'runSync() should be a sync function');
        assert.strictEqual(instance.runAsync instanceof AsyncFunction, true, 'runAsync() should be an async function');

        // Start a test web server
        const { serverPort, cleanup: webServerCleanup } = await startTestWebServer({
            routes: [
                // NOTE: the goal here is to serve relative paths via the browser hash
                //
                // (1) browser visits test page (served by test web server)
                // (2) browser requests component itself by looking at URL hash fragment
                //     (i.e. "#transpiled:async_call/async_call.js" -> , "/transpiled/async_call/async_call.js")
                //     (i.e. "/transpiled/async_call/async_call.js" -> file read of /tmp/xxxxxx/async_call/async_call.js)
                {
                    urlPrefix: '/transpiled/',
                    basePathURL: pathToFileURL(`${outputDir}/`),
                },
                // Serve all other files (ex. the initial HTML for the page)
                { basePathURL: new URL('../../test/', import.meta.url) },
            ],
        });

        // Start a browser to visit the test server
        const browser = await puppeteer.launch({
            executablePath: env.PUPPETEER_PATH,
            args: [
                '--enable-experimental-webassembly-jspi',
                '--flag-switches-begin',
                '--enable-features=WebAssemblyExperimentalJSPI',
                '--flag-switches-end',
            ],
        });

        // Load the test page in the browser, which will trigger tests against
        // the component and/or related browser polyfills
        const {
            output: { json },
        } = await loadTestPage({
            browser,
            serverPort,
            path: 'fixtures/browser/test-pages/something__test.async.html',
            hash: `transpiled:${moduleRelPath}`,
        });

        // Check the output expected to be returned from handle of the
        // guest export (this depends on the component)
        assert.deepStrictEqual(json, { responseText: 'callAsync' });

        await browser.close();
        await webServerCleanup();
        await componentCleanup();
    });
});
