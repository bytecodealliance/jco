import { dirname, join, resolve } from "node:path";
import { execArgv } from "node:process";
import { deepStrictEqual, ok, strictEqual, fail } from "node:assert";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";

import { fileURLToPath, pathToFileURL } from "url";
import puppeteer from "puppeteer";

import {
  exec,
  jcoPath,
  getTmpDir,
  setupAsyncTest,
  startTestWebServer,
  loadTestPage,
} from "./helpers.js";

const multiMemory = execArgv.includes("--experimental-wasm-multi-memory")
  ? ["--multi-memory"]
  : [];

const AsyncFunction = (async () => {}).constructor;

export async function asyncBrowserTest(_fixtures) {
  suite("Async", () => {
    var tmpDir;
    var outDir;
    var outFile;

    suiteSetup(async function () {
      tmpDir = await getTmpDir();
      outDir = resolve(tmpDir, "out-component-dir");
      outFile = resolve(tmpDir, "out-component-file");

      const modulesDir = resolve(tmpDir, "node_modules", "@bytecodealliance");
      await mkdir(modulesDir, { recursive: true });
      await symlink(
        fileURLToPath(new URL("../packages/preview2-shim", import.meta.url)),
        resolve(modulesDir, "preview2-shim"),
        "dir",
      );
    });

    suiteTeardown(async function () {
      try {
        await rm(tmpDir, { recursive: true });
      } catch {}
    });

    teardown(async function () {
      try {
        await rm(outDir, { recursive: true });
        await rm(outFile);
      } catch {}
    });

    test("Transpile async (browser, asyncify)", async () => {
      const componentName = "async-call";
      const {
        instance,
        cleanup: componentCleanup,
        outputDir,
      } = await setupAsyncTest({
        asyncMode: "asyncify",
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
      const browser = await puppeteer.launch();

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
      deepStrictEqual(json, { responseText: "callAsync" });

      await browser.close();
      await webServerCleanup();
      await componentCleanup();
    });

    if (typeof WebAssembly?.Suspending === "function") {
      test("Transpile async (browser, JSPI)", async () => {
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

        strictEqual(
          instance.runSync instanceof AsyncFunction,
          false,
          "runSync() should be a sync function",
        );
        strictEqual(
          instance.runAsync instanceof AsyncFunction,
          true,
          "runAsync() should be an async function",
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
        deepStrictEqual(json, { responseText: "callAsync" });

        await browser.close();
        await webServerCleanup();
        await componentCleanup();
      });
    }
  });
}
