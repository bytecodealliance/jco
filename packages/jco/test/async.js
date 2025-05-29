import { version } from "node:process";
import { resolve } from "node:path";
import { mkdir, readFile, rm, symlink } from "node:fs/promises";

import { fileURLToPath } from "url";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, getTmpDir, setupAsyncTest } from "./helpers.js";
import { AsyncFunction } from "./common.js";

suite("Async", () => {
  test("Transpile async", async () => {
    const tmpDir = await getTmpDir();
    const outDir = resolve(tmpDir, "out-component-dir");
    const outFile = resolve(tmpDir, "out-component-file");

    const modulesDir = resolve(tmpDir, "node_modules", "@bytecodealliance");
    await mkdir(modulesDir, { recursive: true });
    await symlink(
      fileURLToPath(new URL("../packages/preview2-shim", import.meta.url)),
      resolve(modulesDir, "preview2-shim"),
      "dir"
    );

    const name = "flavorful";
    const { stderr } = await exec(
      jcoPath,
      "transpile",
      fileURLToPath(
        new URL(`./fixtures/components/${name}.component.wasm`, import.meta.url)
      ),
      "--no-wasi-shim",
      "--name",
      name,
      "-o",
      outDir
    );
    assert.strictEqual(stderr, "");
    const source = await readFile(`${outDir}/${name}.js`);
    assert.ok(source.toString().includes("export { test"));

    try {
      await rm(outDir, { recursive: true });
      await rm(outFile);
    } catch {}
  });

  test.concurrent("Transpile async (NodeJS, JSPI)", async () => {
    if (typeof WebAssembly?.Suspending !== "function") {
      return;
    }
    const tmpDir = await getTmpDir();
    const outDir = resolve(tmpDir, "out-component-dir");
    const outFile = resolve(tmpDir, "out-component-file");

    const modulesDir = resolve(tmpDir, "node_modules", "@bytecodealliance");
    await mkdir(modulesDir, { recursive: true });
    await symlink(
      fileURLToPath(new URL("../packages/preview2-shim", import.meta.url)),
      resolve(modulesDir, "preview2-shim"),
      "dir"
    );

    const { instance, cleanup, component } = await setupAsyncTest({
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

    assert.strictEqual(instance.runSync(), "called sync");
    assert.strictEqual(await instance.runAsync(), "called async");

    await cleanup();

    try {
      await rm(outDir, { recursive: true });
      await rm(outFile);
    } catch {}
  });

  test.concurrent(
    "Transpile async import and export (NodeJS, JSPI)",
    async () => {
      if (typeof WebAssembly?.Suspending !== "function") {
        return;
      }

      const tmpDir = await getTmpDir();
      const outDir = resolve(tmpDir, "out-component-dir");
      const outFile = resolve(tmpDir, "out-component-file");

      const modulesDir = resolve(tmpDir, "node_modules", "@bytecodealliance");
      await mkdir(modulesDir, { recursive: true });
      await symlink(
        fileURLToPath(new URL("../packages/preview2-shim", import.meta.url)),
        resolve(modulesDir, "preview2-shim"),
        "dir"
      );
      const testMessage = "Hello from Async Function!";
      const { instance, cleanup, component } = await setupAsyncTest({
        asyncMode: "jspi",
        component: {
          name: "async_call",
          path: resolve(
            "test/fixtures/components/simple-nested.component.wasm"
          ),
          imports: {
            "calvinrp:test-async-funcs/hello": {
              helloWorld: async () => await Promise.resolve(testMessage),
            },
          },
        },
        jco: {
          transpile: {
            extraArgs: {
              asyncImports: ["calvinrp:test-async-funcs/hello#hello-world"],
              asyncExports: ["hello-world"],
            },
          },
        },
      });

      assert.strictEqual(
        instance.hello.helloWorld instanceof AsyncFunction,
        true,
        "helloWorld() should be an async function"
      );

      assert.strictEqual(await instance.hello.helloWorld(), testMessage);

      await cleanup();
      try {
        await rm(outDir, { recursive: true });
        await rm(outFile);
      } catch {}
    });

  test("Transpile simple error-context", async (t) => {
      // Skip if we're running in an environment without JSPI
      let nodeMajorVersion = parseInt(version.replace("v", "").split(".")[0]);
      if (nodeMajorVersion < 23) {
          t.skip();
      }

      const { esModule, cleanup, esModuleOutputDir } = await setupAsyncTest({
        asyncMode: "jspi",
        component: {
          name: "async-error-context",
          path: resolve(
            "test/fixtures/components/async-error-context.component.wasm"
          ),
          skipInstantiation: true,
        },
        jco: {
          transpile: {
            extraArgs: {
              asyncExports: ["local:local/run#run"],
              minify: false,
            },
          },
        },
      });

      const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
      const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());

      const runFn = instance["local:local/run"].asyncRun;
      assert.strictEqual(
        runFn instanceof AsyncFunction,
        true,
        "local:local/run should be async"
      );

      // TODO: more of error-context must be implemented for this to run -- particularly:
      // - context get/set
      // - waitable-join
      // - waitable-set-new
      // - waitable-set-drop (?)
      // await runFn();

      await cleanup();
    });
});
