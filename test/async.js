import { join, resolve } from "node:path";
import { execArgv } from "node:process";
import { deepStrictEqual, ok, strictEqual, fail } from "node:assert";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";

import { fileURLToPath, pathToFileURL } from "url";

import { exec, jcoPath, getTmpDir, setupAsyncTest } from "./helpers.js";

const multiMemory = execArgv.includes("--experimental-wasm-multi-memory")
  ? ["--multi-memory"]
  : [];

const AsyncFunction = (async () => {}).constructor;

export async function asyncTest(_fixtures) {
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
        "dir"
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

    test("Transpile async", async () => {
      const name = "flavorful";
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/components/${name}.component.wasm`,
        "--no-wasi-shim",
        "--name",
        name,
        "-o",
        outDir
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/${name}.js`);
      ok(source.toString().includes("export { test"));
    });

    test("Transpile async (NodeJS, JSPI)", async () => {
      if (typeof WebAssembly?.Suspending === "function") {
        return;
      }
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

      strictEqual(
        instance.runSync instanceof AsyncFunction,
        false,
        "runSync() should be a sync function"
      );
      strictEqual(
        instance.runAsync instanceof AsyncFunction,
        true,
        "runAsync() should be an async function"
      );

      strictEqual(instance.runSync(), "called sync");
      strictEqual(await instance.runAsync(), "called async");

      await cleanup();
    });

    test("Transpile async import and export (NodeJS, JSPI)", async () => {
      if (typeof WebAssembly?.Suspending === "function") {
        return;
      }

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

      strictEqual(
        instance.hello.helloWorld instanceof AsyncFunction,
        true,
        "helloWorld() should be an async function"
      );

      strictEqual(await instance.hello.helloWorld(), testMessage);

      await cleanup();
    });

    test("Transpile simple error-context", async () => {
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

      // TODO: FIX, this should be possible to just automatically map/ at least
      // get a pre-filled importMap to use here.
      //
      // Or, we need to just add this to preview2-shim so it's just easy to pass to 
      // custom module instantiation
      const wasi = await import("@bytecodealliance/preview2-shim");
      const instance = await esModule.instantiate(undefined, {
        "wasi:cli/environment": wasi.cli.environment,
        "wasi:cli/exit": wasi.cli.exit,
        "wasi:cli/stderr": wasi.cli.stderr,
        "wasi:cli/stdout": wasi.cli.stdout,
        "wasi:cli/stdin": wasi.cli.stdin,
        "wasi:filesystem/preopens": wasi.filesystem.preopens,
        "wasi:filesystem/types": wasi.filesystem.types,
        "wasi:io/error": wasi.io.error,
        "wasi:io/streams": wasi.io.streams,
        "wasi:random/random": wasi.random.random,
      });

      const runFn = instance["local:local/run"].run;
      strictEqual(
        runFn instanceof AsyncFunction,
        true,
        "local:local/run should be async"
      );

      await runFn();

      await cleanup();
    });
  });
}
