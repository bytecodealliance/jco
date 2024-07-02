import { strictEqual } from "node:assert";
import { readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { normalize, resolve, sep } from "node:path";

import { fileURLToPath, pathToFileURL } from "url";
import { HTTPServer } from "@bytecodealliance/preview2-shim/http";

import { componentNew, preview1AdapterCommandPath } from "../src/api.js";
import { exec, jcoPath, getTmpDir } from "./helpers.js";

export async function witTest() {
  suite("WIT", () => {
    var tmpDir;
    var outFile;

    suiteSetup(async function () {
      tmpDir = await getTmpDir();
      outFile = resolve(tmpDir, "out-component-file");
    });

    suiteTeardown(async function () {
      try {
        await rm(tmpDir, { recursive: true });
      } catch {}
    });

    teardown(async function () {
      try {
        await rm(outFile);
      } catch {}
    });

    /** 
     * Ensure feature gates work properly
     * 
     * see: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md#feature-gates
     */
    test("feature-gates", async () => {
      const runtimeName = "semver";

      const { stderr } = await exec(
        jcoPath,
        "componentize",
        "test/fixtures/componentize/feature-gates/source.js",
        "-w",
        "test/fixtures/wit",
        "--world-name",
        "test:jco-feature-gates/imported",
        "-o",
        outFile
      );
      strictEqual(stderr, "");

      // TODO: check the generated code to ensure that
      // no featuregate related functions are present

      const outDir = fileURLToPath(
        new URL(`./output/${runtimeName}`, import.meta.url)
      );

      {
        const { stderr } = await exec(
          jcoPath,
          "transpile",
          outFile,
          "--name",
          runtimeName,
          "-o",
          outDir
        );
        strictEqual(stderr, "");
      }

      console.log(`OUTPUT to [test/output/${runtimeName}.js]`);

      // TODO(remove): probably don't need to execute it!
      // await exec(`test/output/${runtimeName}.js`);
    });
  });
}
