// import { deepStrictEqual, ok, strictEqual } from "node:assert";
import puppeteer from "puppeteer";
import { mkdir, readFile, writeFile, rm, symlink, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "url";
import { tmpdir } from "node:os";
import { resolve, normalize, sep, extname, dirname } from "node:path";
import { ok, strictEqual } from "node:assert";
import { transpile } from '../src/api.js';
import mime from 'mime';
import { exec, jcoPath } from "./helpers.js";

export async function browserTest() {
  suite("Browser", () => {
    /**
     * Securely creates a temporary directory and returns its path.
     *
     * The new directory is created using `fsPromises.mkdtemp()`.
     */
    async function getTmpDir() {
      return await mkdtemp(normalize(tmpdir() + sep));
    }

    let tmpDir, outDir, outFile, outDirUrl;
    let server, browser;
    suiteSetup(async function () {
      tmpDir = await getTmpDir();
      outDir = resolve(tmpDir, "out-component-dir");
      outDirUrl = pathToFileURL(outDir + '/');
      outFile = resolve(tmpDir, "out-component-file");

      const modulesDir = resolve(tmpDir, "node_modules", "@bytecodealliance");
      await mkdir(modulesDir, { recursive: true });
      await symlink(
        fileURLToPath(new URL("../packages/preview2-shim", import.meta.url)),
        resolve(modulesDir, "preview2-shim"),
        "dir"
      );

      // run a local server on 8080
      server = createServer(async (req, res) => {
        let fileUrl;
        if (req.url.startsWith('/tmpdir/')) {
          fileUrl = new URL(`.${req.url.slice(7)}`, outDirUrl);
        } else {
          fileUrl = new URL(`../${req.url}`, import.meta.url);
        }
        try {
          const html = await readFile(fileUrl);
          res.writeHead(200, { 'content-type': mime.getType(extname(req.url)) });
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
      }).listen(8080);

      browser = await puppeteer.launch();
    });
    suiteTeardown(async function () {
      try {
        await rm(tmpDir, { recursive: true });
      } catch {}
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    });

    teardown(async function () {
      try {
        await rm(outDir, { recursive: true });
        await rm(outFile);
      } catch {}
    });

    async function testBrowserPage (hash) {
      const page = await browser.newPage();

      ok((await page.goto(`http://localhost:8080/test/browser.html#${hash}`)).ok());

      const body = await page.locator('body').waitHandle();

      let bodyHtml = await body.evaluate(el => el.innerHTML);
      while (bodyHtml === '<h1>Running</h1>') {
        bodyHtml = await body.evaluate(el => el.innerHTML);
      }
      strictEqual(bodyHtml, '<h1>OK</h1>');
      await page.close();
    }

    test("Transpilation", async () => {
      await testBrowserPage('transpile');
    });

    test('IDL window', async () => {
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
      strictEqual(stderr, '');

      // Transpile the test component
      const component = await readFile(outFile);
      const { files } = await transpile(component, { name: 'dom' });

      for (const [file, source] of Object.entries(files)) {
        const outPath = resolve(outDir, file);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, source);
      }

      // Run the test function in the browser from the generated tmpdir
      await testBrowserPage('test:dom.js');
    });

    test('IDL console', async () => {
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
      strictEqual(stderr, '');

      // Transpile the test component
      const component = await readFile(outFile);
      const { files } = await transpile(component, { name: 'console' });

      for (const [file, source] of Object.entries(files)) {
        const outPath = resolve(outDir, file);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, source);
      }

      await testBrowserPage('test:console.js');
    });
  });
}
