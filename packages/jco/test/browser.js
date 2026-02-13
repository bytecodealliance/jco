import { mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname, dirname } from "node:path";
import { env } from "node:process";

import puppeteer from "puppeteer";
import { fileURLToPath, pathToFileURL } from "node:url";
import mime from "mime";

import { suite, test, beforeAll, afterAll, afterEach, assert, vi } from "vitest";

import { transpile } from "../src/api.js";
import { getRandomPort, exec, getTmpDir } from "./helpers.js";

suite("Browser", () => {
    let tmpDir, outDir, outFile, outDirUrl;
    let server, port, browser;

    beforeAll(async function () {
        tmpDir = await getTmpDir();
        outDir = resolve(tmpDir, "out-component-dir");
        outDirUrl = pathToFileURL(outDir + "/");
        outFile = resolve(tmpDir, "out-component-file");
        port = await getRandomPort();

        const modulesDir = resolve(tmpDir, "node_modules", "@bytecodealliance");
        await mkdir(modulesDir, { recursive: true });
        await symlink(
            fileURLToPath(new URL("../../preview2-shim", import.meta.url)),
            resolve(modulesDir, "preview2-shim"),
            "dir",
        );

        // run a local server on some port
        server = createServer(async (req, res) => {
            let fileUrl;
            if (req.url.startsWith("/tmpdir/")) {
                fileUrl = new URL(`.${req.url.slice(7)}`, outDirUrl);
            } else {
                fileUrl = new URL(`../../${req.url}`, import.meta.url);
            }
            try {
                const html = await readFile(fileUrl);
                res.writeHead(200, {
                    "content-type": mime.getType(extname(req.url)),
                });
                res.end(html);
            } catch (e) {
                if (e.code === "ENOENT") {
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
                    console.log("ERROR:", err);
                    return false;
                }
            },
            {
                timeout: 30_000,
                interval: 500,
            },
        );

        browser = await puppeteer.launch();
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

    test("basic transpile", { retry: 3 }, async () => {
        await testPage({ browser, port, hash: "transpile" });
    });

    test("IDL window", async () => {
        // Componentize the webidl DOM window test
        const args = [
            "src/jco.js",
            "componentize",
            "test/fixtures/idl/dom.test.js",
            "-d",
            "clocks",
            "-d",
            "random",
            "-d",
            "stdio",
            "-w",
            "test/fixtures/idl/dom.wit",
            "-n",
            "window-test",
            "-o",
            outFile,
        ];
        const { stderr } = await exec(...args);
        assert.strictEqual(stderr, "");

        // Transpile the test component
        const component = await readFile(outFile);
        const { files } = await transpile(component, { name: "dom" });

        for (const [file, source] of Object.entries(files)) {
            const outPath = resolve(outDir, file);
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        // Run the test function in the browser from the generated tmpdir
        await testPage({ browser, port, hash: "test:dom.js" });
    });

    test("IDL console", async () => {
        // Componentize the webidl DOM window test
        const { stderr } = await exec(
            "src/jco.js",
            "componentize",
            "test/fixtures/idl/console.test.js",
            "-d",
            "clocks",
            "-d",
            "random",
            "-d",
            "stdio",
            "-w",
            "test/fixtures/idl/console.wit",
            "-n",
            "console-test",
            "-o",
            outFile,
        );
        assert.strictEqual(stderr, "");

        // Transpile the test component
        const component = await readFile(outFile);
        const { files } = await transpile(component, { name: "console" });

        for (const [file, source] of Object.entries(files)) {
            const outPath = resolve(outDir, file);
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        await testPage({ browser, port, hash: "test:console.js" });
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
        page.on("console", (msg) => console.log("[browser]", msg.text()));
    }

    assert.ok((await page.goto(`http://localhost:${port}/jco/test/browser.html#${hash}`)).ok());

    const body = await page.locator("body").waitHandle();

    let bodyHtml = await body.evaluate((el) => el.innerHTML);
    while (bodyHtml === "<h1>Running</h1>") {
        bodyHtml = await body.evaluate((el) => el.innerHTML);
    }
    const expectedContent = expectedBodyContent ?? "<h1>OK</h1>";
    assert.strictEqual(bodyHtml, expectedContent);
    await page.close();
}
