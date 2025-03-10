import { resolve } from "node:path";
import { mkdir, rm, symlink } from "node:fs/promises";

import { fileURLToPath, pathToFileURL } from "url";
import puppeteer from "puppeteer";

import { suite, test, beforeAll, afterAll, afterEach, assert } from "vitest";

import {
  getTmpDir,
  setupAsyncTest,
  startTestWebServer,
  loadTestPage,
} from "./helpers.js";
import { AsyncFunction } from "./common.js";

suite(`Async`, async () => {
  var tmpDir;
  var outDir;
  var outFile;

  beforeAll(async function () {
    tmpDir = await getTmpDir();
    outDir = resolve(tmpDir, "out-component-dir");
    outFile = resolve(tmpDir, "out-component-file");

    const modulesDir = resolve(tmpDir, "node_modules", "@bytecodealliance");
    await mkdir(modulesDir, { recursive: true });
    await symlink(
      fileURLToPath(new URL("../packages/preview2-shim", import.meta.url)),
      resolve(modulesDir, "preview2-shim"),
      "dir"
    );
  });

  afterAll(async function () {
    try {
      await rm(tmpDir, { recursive: true });
    } catch {}
  });

  afterEach(async function () {
    try {
      await rm(outDir, { recursive: true });
      await rm(outFile);
    } catch {}
  });

  test("Transpile async (browser, JSPI)", async () => {
    if (typeof WebAssembly?.Suspending !== "function") {
      return;
    }
    const componentName = "async-call";
    const {
      instance,
      cleanup: componentCleanup,
      outputDir,
    } = await setupAsyncTest({
      asyncMode: "jspi",
      component: {
        name: "async_call",
        path: resolve("test/fixtures/components/async_call.component.wasm"),
        imports: {
          "something:test/test-interface": {
            callAsync: async () => "called async",
            callSync: () => "called sync",
          },
        },
      },
      jco: {
        transpile: {
          extraArgs: {
            asyncImports: ["something:test/test-interface#call-async"],
            asyncExports: ["run-async"],
          },
        },
      },
    });
    const moduleName = componentName.toLowerCase().replaceAll("-", "_");
    const moduleRelPath = `${moduleName}/${moduleName}.js`;

    assert.strictEqual(
      instance.runSync instanceof AsyncFunction,
      false,
      "runSync() should be a sync function"
    );
    assert.strictEqual(
      instance.runAsync instanceof AsyncFunction,
      true,
      "runAsync() should be an async function"
    );

    // Start a test web server
    const {
      server,
      serverPort,
      cleanup: webServerCleanup,
    } = await startTestWebServer({
      routes: [
        // NOTE: the goal here is to serve relative paths via the browser hash
        //
        // (1) browser visits test page (served by test web server)
        // (2) browser requests component itself by looking at URL hash fragment
        //     (i.e. "#transpiled:async_call/async_call.js" -> , "/transpiled/async_call/async_call.js")
        //     (i.e. "/transpiled/async_call/async_call.js" -> file read of /tmp/xxxxxx/async_call/async_call.js)
        {
          urlPrefix: "/transpiled/",
          basePathURL: pathToFileURL(`${outputDir}/`),
        },
        // Serve all other files (ex. the initial HTML for the page)
        { basePathURL: import.meta.url },
      ],
    });

    // Start a browser to visit the test server
    const browser = await puppeteer.launch({
      args: [
        "--enable-experimental-webassembly-jspi",
        "--flag-switches-begin",
        "--enable-features=WebAssemblyExperimentalJSPI",
        "--flag-switches-end",
      ],
    });

    // Load the test page in the browser, which will trigger tests against
    // the component and/or related browser polyfills
    const {
      page,
      output: { json },
    } = await loadTestPage({
      browser,
      serverPort,
      path: "fixtures/browser/test-pages/something__test.async.html",
      hash: `transpiled:${moduleRelPath}`,
    });

    // Check the output expected to be returned from handle of the
    // guest export (this depends on the component)
    assert.deepStrictEqual(json, { responseText: "callAsync" });

    await browser.close();
    await webServerCleanup();
    await componentCleanup();
  });
});
