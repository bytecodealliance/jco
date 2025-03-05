import { existsSync } from "node:fs";

import { suite, test, assert } from "vitest";

import { getDefaultComponentFixtures } from "./common.js";
import { exec } from "./helpers.js";
import { tsGenerationPromise } from "./typescript.js";

suite("Runtime", async () => {
  const runtimes = await Promise.all(
    (
      await getDefaultComponentFixtures()
    )
      .filter((f) => !f.startsWith("dummy_"))
      .filter((f) => !f.startsWith("wasi-http-proxy"))
      .map((f) => f.replace(/(\.component)?\.(wat|wasm)$/, ""))
      .filter((r) => existsSync(`test/runtime/${r}.ts`))
  );

  for (const runtime of runtimes) {
    test.concurrent(runtime, async () => {
      try {
        await tsGenerationPromise();
      } catch {}
      const { stderr } = await exec(`test/output/${runtime}.js`);
      assert.strictEqual(stderr, "");
    });
  }
});
