import { mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname, dirname } from "node:path";

import puppeteer from "puppeteer";
import { fileURLToPath, pathToFileURL } from "url";
import mime from "mime";

import { suite, test, beforeAll, afterAll, afterEach, assert, vi } from "vitest";

import { transpile } from "../src/api.js";
import { getRandomPort, exec, jcoPath, getTmpDir } from "./helpers.js";

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
      fileURLToPath(new URL("../packages/preview2-shim", import.meta.url)),
      resolve(modulesDir, "preview2-shim"),
      "dir"
    );

    // run a local server on some port
    server = createServer(async (req, res) => {
      let fileUrl;
      if (req.url.startsWith("/tmpdir/")) {
        fileUrl = new URL(`.${req.url.slice(7)}`, outDirUrl);
      } else {
        fileUrl = new URL(`../${req.url}`, import.meta.url);
      }
      try {
        const html = await readFile(fileUrl);
        res.writeHead(200, { "content-type": mime.getType(extname(req.url)) });
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
    await vi.waitUntil(async () => {
      let res;
      try {
        // NOTE: we only need the request to succeed to know the server is running
        // requesting the root will actually return a 500 due to attempt to open a dir
        res = await fetch(`http://localhost:${port}`);
        return true;
      } catch(err) {
        console.log("ERROR:", err);
        return false;
      }
    }, {
      timeout: 30_000,
      interval: 500,
    });

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

  test("Transpilation", async () => {
    await testPage(browser, port, "transpile");
  });

  test("IDL window", async () => {
    // Componentize the webidl DOM window test
    const { stdout: _, stderr } = await exec(
      jcoPath,
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
      outFile
    );
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
    await testPage(browser, port, "test:dom.js");
  });

  test("IDL console", async () => {
    // Componentize the webidl DOM window test
    const { stdout: _, stderr } = await exec(
      jcoPath,
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
      outFile
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

    await testPage(browser, port, "test:console.js");
  });
});

export async function testPage(browser, port, hash) {
  const page = await browser.newPage();

  assert.ok(
    (await page.goto(`http://localhost:${port}/test/browser.html#${hash}`)).ok()
  );

  const body = await page.locator("body").waitHandle();

  let bodyHtml = await body.evaluate((el) => el.innerHTML);
  while (bodyHtml === "<h1>Running</h1>") {
    bodyHtml = await body.evaluate((el) => el.innerHTML);
  }
  assert.strictEqual(bodyHtml, "<h1>OK</h1>");
  await page.close();
}
