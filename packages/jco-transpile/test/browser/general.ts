import { mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { createServer, Server } from 'node:http';
import { resolve, extname, join } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';
import mime from 'mime';

import { suite, test, beforeAll, afterAll, afterEach, assert, vi } from 'vitest';

import { transpileBytes, writeFiles } from '../../src/index.js';
import { componentize } from '@bytecodealliance/componentize-js';

import { getRandomPort, getTmpDir } from '../helpers.js';
import { WEBIDL_FIXTURES_DIR } from '../common.js';

suite('Browser', () => {
    let tmpDir: string;
    let outDir: string;
    let outFile: string;
    let outDirUrl: URL;
    let server: Server;
    let port: number;
    let browser: Browser;

    beforeAll(async function () {
        tmpDir = await getTmpDir();
        outDir = resolve(tmpDir, 'out-component-dir');
        outDirUrl = pathToFileURL(outDir + '/');
        outFile = resolve(tmpDir, 'out-component-file');
        port = await getRandomPort();

        const modulesDir = resolve(tmpDir, 'node_modules', '@bytecodealliance');
        await mkdir(modulesDir, { recursive: true });
        await symlink(
            fileURLToPath(new URL('../../preview2-shim', import.meta.url)),
            resolve(modulesDir, 'preview2-shim'),
            'dir',
        );

        // run a local server on some port
        server = createServer(async (req, res) => {
            let fileUrl;
            if (req.url === undefined) {
                throw new Error('undefined url');
            }
            if (req.url.startsWith('/tmpdir/')) {
                fileUrl = new URL(`.${req.url.slice(7)}`, outDirUrl);
            } else {
                fileUrl = new URL(`../../../${req.url}`, import.meta.url);
            }
            try {
                const html = await readFile(fileUrl);
                res.writeHead(200, {
                    'content-type': mime.getType(extname(req.url)),
                });
                res.end(html);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end(e.message);
                } else {
                    res.writeHead(500);
                    res.end(e.message);
                }
            }
        }).listen(port);

        // Wait until the server is ready
        await vi.waitUntil(
            async () => {
                try {
                    // NOTE: we only need the request to succeed to know the server is running
                    // requesting the root will actually return a 500 due to attempt to open a dir
                    await fetch(`http://localhost:${port}`);
                    return true;
                } catch (err) {
                    console.log('ERROR:', err);
                    return false;
                }
            },
            {
                timeout: 30_000,
                interval: 500,
            },
        );

        browser = await puppeteer.launch({
            executablePath: env.PUPPETEER_PATH,
        });
    });

    afterAll(async function () {
        try {
            await rm(tmpDir, { recursive: true });
        } catch {}
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    });

    afterEach(async function () {
        try {
            await rm(outDir, { recursive: true });
            await rm(outFile);
        } catch {}
    });

    test('basic transpile', { retry: 3 }, async () => {
        await testPage({ browser, port, hash: 'transpile' });
    });

    test('IDL window', async () => {
        const { component } = await componentize({
            sourcePath: join(WEBIDL_FIXTURES_DIR, 'dom.test.js'),
            disableFeatures: ['clocks', 'random', 'stdio'],
            witPath: join(WEBIDL_FIXTURES_DIR, 'dom.wit'),
            worldName: 'window-test',
        });

        // Transpile the test component
        const { files } = await transpileBytes(component, { name: 'dom' });
        await writeFiles(files, { baseDir: outDir });

        // Run the test function in the browser from the generated tmpdir
        await testPage({ browser, port, hash: 'test:dom.js' });
    });

    test('IDL console', async () => {
        const { component } = await componentize({
            sourcePath: join(WEBIDL_FIXTURES_DIR, 'console.test.js'),
            disableFeatures: ['clocks', 'random', 'stdio'],
            witPath: join(WEBIDL_FIXTURES_DIR, 'console.wit'),
            worldName: 'console-test',
        });

        // Transpile the test component
        const { files } = await transpileBytes(component, { name: 'console' });
        await writeFiles(files, { baseDir: outDir });

        await testPage({ browser, port, hash: 'test:console.js' });
    });
});

/**
 * Test an individual browser page that is set up to do a transpilation
 * (see browser.html)
 *
 * NOTE: This test can fail if you are missing built outputs (e.g. in packages/jco/obj)
 * or transpilation output, or have bad code coming out of component bindgen.
 *
 * If you find no output at all from the page, it's likely that loading a script
 * has failed (something as simple as an incorrect path in the importmap, or missing
 * dependency, dependency with bad code, etc.), and you should likely enable puppeteer
 * logging.
 *
 * Consider setting JCO_DEBUG=true to see output from the headless browser.
 *
 */
export async function testPage(args) {
    const { browser, port, hash, expectedBodyContent } = args;
    const page = await browser.newPage();
    if (env.JCO_DEBUG) {
        page.on('console', (msg) => console.log('[browser]', msg.text()));
    }

    assert.ok((await page.goto(`http://localhost:${port}/jco-transpile/test/browser/index.html#${hash}`)).ok());

    const body = await page.locator('body').waitHandle();

    let bodyHtml = await body.evaluate((el) => el.innerHTML);
    while (bodyHtml === '<h1>Running</h1>') {
        bodyHtml = await body.evaluate((el) => el.innerHTML);
    }
    const expectedContent = expectedBodyContent ?? '<h1>OK</h1>';
    assert.strictEqual(bodyHtml, expectedContent);
    await page.close();
}
