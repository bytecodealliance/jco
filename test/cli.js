import { resolve, join } from "node:path";
import { execArgv } from "node:process";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";

import { fileURLToPath, pathToFileURL } from "url";
import { exec, jcoPath, getTmpDir } from "./helpers.js";

const multiMemory = execArgv.includes("--experimental-wasm-multi-memory")
  ? ["--multi-memory"]
  : [];

const AsyncFunction = (async () => {}).constructor;

export async function cliTest(_fixtures) {
  suite("CLI", () => {
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

    test("Transcoding", async () => {
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/env-allow.composed.wasm`,
        ...multiMemory,
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      await writeFile(
        `${outDir}/package.json`,
        JSON.stringify({ type: "module" }),
      );
      const m = await import(`${pathToFileURL(outDir)}/env-allow.composed.js`);
      deepStrictEqual(m.testGetEnv(), [["CUSTOM", "VAL"]]);
    });

    test("Resource transfer", async () => {
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/stdio.composed.wasm`,
        ...multiMemory,
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      await writeFile(
        `${outDir}/package.json`,
        JSON.stringify({ type: "module" }),
      );
      const m = await import(`${pathToFileURL(outDir)}/stdio.composed.js`);
      m.testStdio();
    });

    test("Resource transfer valid lifting", async () => {
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/stdio.composed.wasm`,
        ...multiMemory,
        "--valid-lifting-optimization",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      await writeFile(
        `${outDir}/package.json`,
        JSON.stringify({ type: "module" }),
      );
      const m = await import(`${pathToFileURL(outDir)}/stdio.composed.js`);
      m.testStdio();
    });

    test("Transpile", async () => {
      const name = "flavorful";
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/components/${name}.component.wasm`,
        "--no-wasi-shim",
        "--name",
        name,
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/${name}.js`);
      ok(source.toString().includes("export { test"));
    });

    if (typeof WebAssembly.Suspending === "function") {
      test("Transpile with Async Mode for JSPI", async () => {
        const name = "async_call";
        const { stderr } = await exec(
          jcoPath,
          "transpile",
          `test/fixtures/components/${name}.component.wasm`,
          `--name=${name}`,
          "--valid-lifting-optimization",
          "--tla-compat",
          "--instantiation=async",
          "--base64-cutoff=0",
          "--async-mode=jspi",
          "--async-imports=something:test/test-interface#call-async",
          "--async-exports=run-async",
          "-o",
          outDir,
        );
        strictEqual(stderr, "");
        await writeFile(
          `${outDir}/package.json`,
          JSON.stringify({ type: "module" }),
        );
        const m = await import(`${pathToFileURL(outDir)}/${name}.js`);
        const inst = await m.instantiate(undefined, {
          "something:test/test-interface": {
            callAsync: async () => "called async",
            callSync: () => "called sync",
          },
        });
        strictEqual(inst.runSync instanceof AsyncFunction, false);
        strictEqual(inst.runAsync instanceof AsyncFunction, true);

        strictEqual(inst.runSync(), "called sync");
        strictEqual(await inst.runAsync(), "called async");
      });
    }

    test("Transpile with Async Mode for Asyncify", async () => {
      const name = "async_call";
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/components/${name}.component.wasm`,
        `--name=${name}`,
        "--valid-lifting-optimization",
        "--tla-compat",
        "--instantiation=async",
        "--base64-cutoff=0",
        "--async-mode=asyncify",
        "--async-imports=something:test/test-interface#call-async",
        "--async-exports=run-async",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      await writeFile(
        `${outDir}/package.json`,
        JSON.stringify({ type: "module" }),
      );
      const m = await import(`${pathToFileURL(outDir)}/${name}.js`);
      const inst = await m.instantiate(undefined, {
        "something:test/test-interface": {
          callAsync: async () => "called async",
          callSync: () => "called sync",
        },
      });
      strictEqual(inst.runSync instanceof AsyncFunction, false);
      strictEqual(inst.runAsync instanceof AsyncFunction, true);

      strictEqual(inst.runSync(), "called sync");
      strictEqual(await inst.runAsync(), "called async");
    });

    test("Transpile & Optimize & Minify", async () => {
      const name = "flavorful";
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/components/${name}.component.wasm`,
        "--name",
        name,
        "--valid-lifting-optimization",
        "--tla-compat",
        "--optimize",
        "--minify",
        "--base64-cutoff=0",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/${name}.js`);
      ok(source.toString().includes("as test,"));
    });

    test("Transpile with tracing", async () => {
      const name = "flavorful";
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/components/${name}.component.wasm`,
        "--name",
        name,
        "--map",
        "testwasi=./wasi.js",
        "--tracing",
        "--base64-cutoff=0",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/${name}.js`, "utf8");
      ok(source.includes("function toResultString("));
      ok(
        source.includes(
          'console.error(`[module="test:flavorful/test", function="f-list-in-record1"] call a',
        ),
      );
      ok(
        source.includes(
          'console.error(`[module="test:flavorful/test", function="list-of-variants"] return result=${toResultString(ret)}`);',
        ),
      );
    });

    test("Type generation", async () => {
      const { stderr } = await exec(
        jcoPath,
        "types",
        "test/fixtures/wit",
        "--world-name",
        "test:flavorful/flavorful",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/flavorful.d.ts`, "utf8");
      ok(source.includes("export const test"));
      const iface = await readFile(`${outDir}/interfaces/test-flavorful-test.d.ts`, "utf8");
      ok(iface.includes("export namespace TestFlavorfulTest {"));
    });

    test("Type generation (specific features)", async () => {
      const { stderr, stdout } = await exec(
        jcoPath,
        "types",
        "test/fixtures/wits/feature-gates-unstable.wit",
        "--world-name",
        "test:feature-gates-unstable/gated",
        "--feature",
        "enable-c",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(
        `${outDir}/interfaces/test-feature-gates-unstable-foo.d.ts`,
        "utf8",
      );
      ok(source.includes("export function a(): void;"));
      ok(!source.includes("export function b(): void;"));
      ok(source.includes("export function c(): void;"));
    });

    test("Type generation (all features)", async () => {
      const { stderr, stdout } = await exec(
        jcoPath,
        "types",
        "test/fixtures/wits/feature-gates-unstable.wit",
        "--world-name",
        "test:feature-gates-unstable/gated",
        "--all-features",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(
        `${outDir}/interfaces/test-feature-gates-unstable-foo.d.ts`,
        "utf8",
      );
      ok(source.includes("export function a(): void;"));
      ok(source.includes("export function b(): void;"));
      ok(source.includes("export function c(): void;"));
    });

    // NOTE: enabling all features and a specific feature means --all-features takes precedence
    test("Type generation (all features + feature)", async () => {
      const { stderr, stdout } = await exec(
        jcoPath,
        "types",
        "test/fixtures/wits/feature-gates-unstable.wit",
        "--world-name",
        "test:feature-gates-unstable/gated",
        "--all-features",
        "--feature",
        "enable-c",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(
        `${outDir}/interfaces/test-feature-gates-unstable-foo.d.ts`,
        "utf8",
      );
      ok(source.includes("export function a(): void;"));
      ok(source.includes("export function b(): void;"));
      ok(source.includes("export function c(): void;"));
    });

    test("Type generation (declare imports)", async () => {
      const { stderr } = await exec(
        jcoPath,
        "guest-types",
        "test/fixtures/wit",
        "--world-name",
        "test:flavorful/flavorful",
        "-o",
        outDir
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/interfaces/test-flavorful-test.d.ts`, "utf8");
      // NOTE: generation of guest types *no longer* produces an explicitly exported module
      // but rather contains an typescript ambient module (w/ opt-in for producing explicit
      // module declarations if necessary)
      //
      // see: https://github.com/bytecodealliance/jco/pull/528
      ok(source.includes("declare module 'test:flavorful/test' {"));
    });

    test("TypeScript naming checks", async () => {
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/wit/deps/ts-check/ts-check.wit`,
        "--stub",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      {
        const source = await readFile(`${outDir}/ts-check.d.ts`);
        ok(source.toString().includes("declare function _class(): void"));
        ok(source.toString().includes("export { _class as class }"));
      }
      {
        const source = await readFile(
          `${outDir}/interfaces/ts-naming-blah.d.ts`,
        );
        ok(source.toString().includes("declare function _class(): void"));
        ok(source.toString().includes("export { _class as class }"));
      }
    });

    test("Transpile to JS", async () => {
      const name = "flavorful";
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/components/${name}.component.wasm`,
        "--name",
        name,
        "--map",
        "test:flavorful/test=./flavorful.js",
        "--valid-lifting-optimization",
        "--tla-compat",
        "--js",
        "--base64-cutoff=0",
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/${name}.js`, "utf8");
      ok(source.includes("./flavorful.js"));
      ok(source.includes("FUNCTION_TABLE"));
      ok(source.includes("export {\n  $init"));
    });

    test("Transpile without namespaced exports", async () => {
      const name = "flavorful";
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/components/${name}.component.wasm`,
        "--no-namespaced-exports",
        "--no-wasi-shim",
        "--name",
        name,
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/${name}.js`);
      const finalLine = source.toString().split("\n").at(-1);
      //Check final line is the export statement
      ok(finalLine.toString().includes("export {"));
      //Check that it does not contain the namespaced export
      ok(!finalLine.toString().includes("test:flavorful/test"));
    });

    test("Transpile with namespaced exports", async () => {
      const name = "flavorful";
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/components/${name}.component.wasm`,
        "--no-wasi-shim",
        "--name",
        name,
        "-o",
        outDir,
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/${name}.js`);
      const finalLine = source.toString().split("\n").at(-1);
      //Check final line is the export statement
      ok(finalLine.toString().includes("export {"));
      //Check that it does contain the namespaced export
      ok(finalLine.toString().includes("test as 'test:flavorful/test'"));
    });

    test("Optimize", async () => {
      const component = await readFile(
        `test/fixtures/components/flavorful.component.wasm`,
      );
      const { stderr, stdout } = await exec(
        jcoPath,
        "opt",
        `test/fixtures/components/flavorful.component.wasm`,
        "-o",
        outFile,
      );
      strictEqual(stderr, "");
      ok(stdout.includes("Core Module 1:"));
      const optimizedComponent = await readFile(outFile);
      ok(optimizedComponent.byteLength < component.byteLength);
    });

    test("Print & Parse", async () => {
      const { stderr, stdout } = await exec(
        jcoPath,
        "print",
        `test/fixtures/components/flavorful.component.wasm`,
      );
      strictEqual(stderr, "");
      strictEqual(stdout.slice(0, 10), "(component");
      {
        const { stderr, stdout } = await exec(
          jcoPath,
          "print",
          `test/fixtures/components/flavorful.component.wasm`,
          "-o",
          outFile,
        );
        strictEqual(stderr, "");
        strictEqual(stdout, "");
      }
      {
        const { stderr, stdout } = await exec(
          jcoPath,
          "parse",
          outFile,
          "-o",
          outFile,
        );
        strictEqual(stderr, "");
        strictEqual(stdout, "");
        ok(await readFile(outFile));
      }
    });

    test("Wit shadowing stub test", async () => {
      const { stderr, stdout } = await exec(
        jcoPath,
        "transpile",
        `test/fixtures/wit/deps/app/app.wit`,
        "-o",
        outDir,
        "--stub",
      );
      strictEqual(stderr, "");
      const source = await readFile(`${outDir}/app.js`);
      ok(source.includes("class PString$1{"));
    });

    test("Wit & New", async () => {
      const { stderr, stdout } = await exec(
        jcoPath,
        "wit",
        `test/fixtures/components/flavorful.component.wasm`,
      );
      strictEqual(stderr, "");
      ok(stdout.includes("world root {"));

      {
        const { stderr, stdout } = await exec(
          jcoPath,
          "embed",
          "--dummy",
          "--wit",
          "test/fixtures/wit/deps/flavorful/flavorful.wit",
          "-m",
          "language=javascript",
          "-m",
          "processed-by=dummy-gen@test",
          "-o",
          outFile,
        );
        strictEqual(stderr, "");
        strictEqual(stdout, "");
      }

      {
        const { stderr, stdout } = await exec(jcoPath, "print", outFile);
        strictEqual(stderr, "");
        strictEqual(stdout.slice(0, 7), "(module");
      }
      {
        const { stderr, stdout } = await exec(
          jcoPath,
          "new",
          outFile,
          "-o",
          outFile,
        );
        strictEqual(stderr, "");
        strictEqual(stdout, "");
      }
      {
        const { stderr, stdout } = await exec(jcoPath, "print", outFile);
        strictEqual(stderr, "");
        strictEqual(stdout.slice(0, 10), "(component");
      }
      {
        const { stdout, stderr } = await exec(
          jcoPath,
          "metadata-show",
          outFile,
          "--json",
        );
        strictEqual(stderr, "");
        const meta = JSON.parse(stdout);
        // NOTE: the check below is depends on *how many* modules *and* components are
        // generated by wit-component (as used by the wasm-tools rust dep in this project)
        // and componentize-js.
        //
        // As such, this is subject to optimizations or changes in operation of
        // upstream functionality and may change with upstream releases -- for example
        // the addition of a "glue" or redirection-heavy module/component
        deepStrictEqual(meta[0].metaType, { tag: "component", val: 5 });
        deepStrictEqual(meta[1].producers, [
          [
            "processed-by",
            [
              ["wit-component", "0.220.0"],
              ["dummy-gen", "test"],
            ],
          ],
          ["language", [["javascript", ""]]],
        ]);
      }
    });

    test("Component new adapt", async () => {
      const { stderr } = await exec(
        jcoPath,
        "new",
        "test/fixtures/modules/exitcode.wasm",
        "--wasi-reactor",
        "-o",
        outFile,
      );
      strictEqual(stderr, "");
      {
        const { stderr, stdout } = await exec(jcoPath, "print", outFile);
        strictEqual(stderr, "");
        strictEqual(stdout.slice(0, 10), "(component");
      }
    });

    test("Extract metadata", async () => {
      const { stdout, stderr } = await exec(
        jcoPath,
        "metadata-show",
        "test/fixtures/modules/exitcode.wasm",
        "--json",
      );
      strictEqual(stderr, "");
      deepStrictEqual(JSON.parse(stdout), [
        {
          metaType: { tag: "module" },
          producers: [],
          range: [0, 262],
        },
      ]);
    });

    test("Componentize", async () => {
      const { stdout, stderr } = await exec(
        jcoPath,
        "componentize",
        "test/fixtures/componentize/source.js",
        "-d",
        "all",
        "--aot",
        "-w",
        "test/fixtures/componentize/source.wit",
        "-o",
        outFile,
      );
      strictEqual(stderr, "");
      {
        const { stderr } = await exec(
          jcoPath,
          "transpile",
          outFile,
          "--name",
          "componentize",
          "--map",
          "local:test/foo=./foo.js",
          "-o",
          outDir,
        );
        strictEqual(stderr, "");
      }
      await writeFile(
        `${outDir}/package.json`,
        JSON.stringify({ type: "module" }),
      );
      await writeFile(`${outDir}/foo.js`, `export class Bar {}`);
      const m = await import(`${pathToFileURL(outDir)}/componentize.js`);
      strictEqual(m.hello(), "world");
      // strictEqual(m.consumeBar(m.createBar()), 'bar1');
    });
  });
}

// Cache of componentize byte outputs
const CACHE_COMPONENTIZE_OUTPUT = {};

/**
 * Small cache for componentizations to save build time by storing componentize
 * output in memory
 *
 * @param {string} outputPath - path to where to write the component
 * @param {string[]} args - arguments to be fed to `jco componentize` (*without* "compnentize" or "-o/--output")
 */
async function cachedComponentize(outputPath, args) {
  const cacheKey = args.join("+");
  if (cacheKey in CACHE_COMPONENTIZE_OUTPUT) {
    await writeFile(outputPath, CACHE_COMPONENTIZE_OUTPUT[cacheKey]);
    return;
  }

  const { stdout, stderr } = await exec(
    jcoPath,
    "componentize",
    ...args,
    "-o",
    outputPath,
  );
  strictEqual(stderr, "");

  CACHE_COMPONENTIZE_OUTPUT[cacheKey] = await readFile(outputPath);
}
