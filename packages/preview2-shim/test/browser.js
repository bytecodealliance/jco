import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { suite, test, assert } from "vitest";
import { componentize } from "@bytecodealliance/componentize-js";
import { transpile } from "@bytecodealliance/jco";

import { getTmpDir, FIXTURES_WIT_DIR, startTestServer, runBasicHarnessPageTest } from "./common.js";

suite("browser", () => {
  test("fs-open", async () => {
      const outDir = await getTmpDir();

      // Create a component that does a basic filesystem operation
      // This component complies with the component world for the basic-harness fixture
      //
      // TODO: we can pre-compile and cache components like this locally for faster runs
      const successMsg = "SUCCESS: opened file";
      const { component } = await componentize(
`
import { getDirectories } from "wasi:filesystem/preopens@0.2.8";

export const test = {
    run() {
        const preopens = getDirectories();
        if (preopens.length === 0) { throw "ERROR: no preopens"; }

        const dirDescriptor = preopens[0][0];
        const dirRes = dirDescriptor.openAt(
            {symlinkFollow: false},
            ".",
            { create: true },
            { write: true },
        );
        if (dirRes.tag === "err") {
            throw "ERROR: failed to open dir: " + dirRes.val;
        }
        return "${successMsg}";
    }
}
`,
          {
              sourceName: 'component',
              witPath: FIXTURES_WIT_DIR,
              worldName: 'browser-fs-write',
          });

      // Transpile the component, write all output files to a temporary directory
      const { files } = await transpile(component, {
          async: true,
          name: 'component',
          optimize: false,
          asyncMode: 'jspi',
          wasiShim: true,
          outDir,
      });
      for (const [outPath, source] of Object.entries(files)) {
          await mkdir(dirname(outPath), { recursive: true });
          await writeFile(outPath, source);
      }

      // Start a test server
      const { baseURL, browser, cleanup } = await startTestServer({
          transpiledOutputDir: outDir,
      });

      // Run the test based on the basic harness code
      const { statusJSON } = await runBasicHarnessPageTest({
          browser,
          url: `${baseURL}/index.html#transpiled:component.js`,
      });

      assert.strictEqual(statusJSON.msg, successMsg);

      await cleanup();
  });
});
