import { env } from "node:process";
import { pathToFileURL, URL, fileURLToPath } from "node:url";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { sep, normalize, resolve, extname } from "node:path";
import { createServer as createHTTPServer } from "node:http";

import puppeteer from 'puppeteer';
import mime from 'mime';

import { vi, assert } from "vitest";

export const BASIC_HARNESS_HTML_DIR = fileURLToPath(new URL("./fixtures/browser/basic-harness", import.meta.url));

export const P2_SHIM_CODE_DIR = fileURLToPath(new URL("../", import.meta.url));

export const FIXTURES_WIT_DIR = fileURLToPath(new URL("./fixtures/wit", import.meta.url));

/**
 * Securely creates a temporary directory and returns its path.
 *
 * The new directory is created using `fsPromises.mkdtemp()`.
 *
 * @return {Promise<string>} A Promise that resolves to the created temporary directory
 */
export async function getTmpDir() {
    return await mkdtemp(normalize(tmpdir() + sep));
}

/** Check if a path is an existing directory */
export async function isExistingDir(p) {
    if (!p || typeof p !== 'string') { throw new Error(`invalid path [${p}]`); }
    return await stat(p).then((p) => p.isDirectory()).catch(() => false);
}

/**
 * Start a server that can be used for testing
 *
 * @param {object} args
 * @param {string} args.transpiledOutputDir - Directory that contains a transpiled component to be loaded into the browser
 * @param {string} [args.htmlDir] - Directory that contains HTML that should be served by the server in all other cases (by deafult this uses the default harness index.html)
 * @param {string} [args.tmpDir] - Directory in which to do work (e.g. a dir in /tmp)
 * @param {string} [args.outDir] - Directory in which to place build outputs (normally inside scratch dir)
 * @param {boolean} [args.debug] - Directory in which to place build outputs (normally inside scratch dir)
 */
export async function startTestServer(args) {
    const debug = args?.debug;

    if (!args.transpiledOutputDir) {
        throw new Error("Output directory of transpiled component was not provided");
    }
    if (!(await isExistingDir(args.transpiledOutputDir))) {
        throw new Error("transpiled outputdir is missing");
    }
    const transpiledOutputDir = resolve(args.transpiledOutputDir);
    if (debug) {
        console.error(`serving transpiled output @ [${transpiledOutputDir}]`);
    }

    let htmlDir = args.htmlDir ?? BASIC_HARNESS_HTML_DIR;
    if (!(await isExistingDir(htmlDir))) {
        throw new Error("transpiled outputdir is missing");
    }
    htmlDir = resolve(htmlDir);
    if (debug) {
        console.error(`serving HTML @ [${htmlDir}]`);
    }

    // // Create temp dir to put code in
    // const tmpDir = args.tmpDir ?? await getTmpDir();
    // await mkdir(tmpDir, { recursive: true });

    // // Symlink preview2-shim into the output directory so it can be used
    // // by the workload
    // const modulesDir = resolve(tmpDir, 'node_modules', '@bytecodealliance');
    // await mkdir(modulesDir, { recursive: true });
    // await symlink(
    //     fileURLToPath(new URL('../../preview2-shim', import.meta.url)),
    //     resolve(modulesDir, 'preview2-shim'),
    //     'dir'
    // );

    // Create a local HTTP server that will serve the files in the directory
    const { server } = await new Promise(resolve => {
        // Pre-compute the outDir as a URL
        const outDirURL = pathToFileURL(transpiledOutputDir + '/');
        const p2ShimDirURL = pathToFileURL(P2_SHIM_CODE_DIR);
        const htmlDirURL = pathToFileURL(htmlDir + '/');

        const newServer = createHTTPServer(async (req, res) => {
            // Handle CORS preflight for all endpoints
            if (req.method === 'OPTIONS') {
                res.writeHead(204, {
                    'access-control-allow-origin': '*',
                    'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                    'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
                    'access-control-expose-headers': '*',
                    'access-control-max-age': '86400',
                });
                res.end();
                return;
            }

            if (req.url === '/api/test-echo') {
                res.writeHead(200, {
                    'content-type': 'application/json',
                    'x-test-header': 'test-value',
                    'access-control-allow-origin': '*',
                });
                res.end(JSON.stringify({ message: 'hello from test server' }));
                return;
            }

            // Wasmtime-compatible echo endpoint: echoes method, URI, and body
            if (req.url.startsWith('/echo/') || ['/get', '/post', '/put'].includes(req.url.split('?')[0])) {
                const chunks = [];
                for await (const chunk of req) {chunks.push(chunk);}
                const body = Buffer.concat(chunks);
                res.writeHead(200, {
                    'content-type': 'application/octet-stream',
                    'x-wasmtime-test-method': req.method,
                    'x-wasmtime-test-uri': req.url,
                    'access-control-allow-origin': '*',
                    'access-control-expose-headers': 'x-wasmtime-test-method, x-wasmtime-test-uri',
                });
                res.end(body);
                return;
            }

            let fileURL;
            try {
                if (req.url.startsWith('/transpiled/')) {
                    // Strip prefix and load file from the transpiled output dir
                    const rest = req.url.slice('/transpiled/'.length);
                    fileURL = new URL(`./${rest}`, outDirURL);
                } else if (req.url.startsWith('/preview2-shim/')) {
                    const rest = req.url.slice('/preview2-shim/'.length);
                    // Strip prefix and load file from the symlinked preview2-shim dir
                    fileURL = new URL(`./${rest}`, p2ShimDirURL);
                } else if (req.url === '/') {
                    fileURL = new URL(`./index.html`, htmlDirURL);
                } else {
                    // Read all other files from the HTML directory
                    fileURL = new URL(`.${req.url}`, htmlDirURL);
                }

                if (debug) {
                    console.error('[server] serving file', fileURLToPath(fileURL));
                }

                const html = await readFile(fileURLToPath(fileURL));
                res.writeHead(200, {
                    'content-type': mime.getType(extname(req.url)),
                });
                res.end(html);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    if (debug) {
                        console.error(`[server] ERROR: no such file [${req.url}] (fileURL ? [${fileURL}]): ${e}`);
                    }
                    res.writeHead(404);
                    res.end(e.message);
                } else {
                    if (debug) {
                    console.error(`[server] ERROR: failed to serve URL [${req.url}] (fileURL ? [${fileURL}]): ${e}`);
                    }
                    res.writeHead(500);
                    res.end(e.message);
                }
            }
        });

        newServer.listen(0, 'localhost', () => {
            resolve({ server: newServer });
        });
    });

    const {
        family,
        address,
        port,
    } = server.address();
    const baseURL = `http://${family === 'IPv6' ? '[' + address + ']' : address }:${port}`;

    // Wait until the server is serving the page
    await vi.waitUntil(
        async () => {
            try {
                // NOTE: we only need the request to succeed to know the server is running
                // requesting the root will actually return a 500 due to attempt to open a dir
                await fetch(baseURL);
                return true;
            } catch (err) {
                console.log('error while validating server setup:', err);
                return false;
            }
        },
        {
            timeout: 60_000,
            interval: 500,
        }
    );

    // Launch a puppeteer instance
    const browser = await puppeteer.launch({
        args: [
            ...(env.TEST_PUPPETEER_LAUNCH_ARGS ?? '').split(","),
            '--enable-experimental-webassembly-jspi',
            '--flag-switches-begin',
            '--enable-features=WebAssemblyExperimentalJSPI',
            '--flag-switches-end',
        ],
    });

    return {
        server,
        port,
        baseURL,
        browser,
        cleanup: async () => {
            await new Promise((resolve) => server.close(resolve));
        },
    };
}

/**
 * Run thet test for a basic harness, by loading a given URL
 * and evaluating the body to watch completion
*/
export async function runBasicHarnessPageTest(args) {
    const {
        browser,
        url,
        debug,
    } = args;
    const page = await browser.newPage();
    if (debug) {
        page.on('console', msg => console.log('[browser] log:', msg.text()));
    }

    let nav = await page.goto(url);
    assert.ok(nav.ok());

    const body = await page.locator('body').waitHandle();
    let statusJSON = { status: 'init' };

    // Continuously wait for the body tag to contain a JSON object that
    // conveys status of the test
    let bodyHTML;
    try {
        await vi.waitUntil(
            async () => {
                try {
                    bodyHTML = await body.evaluate((el) => el.innerHTML);
                    if (!bodyHTML) { return false; }
                    statusJSON = JSON.parse(bodyHTML);
                    return statusJSON.status === 'success' || statusJSON.status === 'error';
                } catch (err) {
                    console.log("BODY HTML:", bodyHTML);
                    console.error("Failed to parse intermediate result body HTML as JSON", err);
                    return false;
                }
            },
            {
                timeout: 10_000,
                interval: 500,
            },
        );
    } catch (err) {
        console.error("failed to run the on-page test, HTML:", bodyHTML);
        throw err;
    }

    if (statusJSON.status === 'error') {
        assert.fail(`page result is a failure: ${statusJSON.msg}`);
    }
    assert(statusJSON.status === 'success');

    await page.close();

    return { statusJSON };
}
