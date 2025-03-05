import { readFile } from "node:fs/promises";

import { fileURLToPath } from "url";

import { transpile, componentNew, componentEmbed } from "../src/api.js";

import { suite, test, beforeAll, assert } from "vitest";

import { exec } from "./helpers.js";
import { NODE_MODULES_TSC_BIN_PATH } from "./common.js";

const TS_GENERATION_PROMISE = (() => {
  let promise;
  return function tsGenerationPromise() {
    if (promise) return promise;
    return (promise = (async () => {
      var { stderr } = await exec(
        NODE_MODULES_TSC_BIN_PATH,
        "-p",
        "test/tsconfig.json"
      );
      assert.strictEqual(stderr, "");
    })());
  };
})();

suite(`TypeScript`, async () => {
  beforeAll(async () => {
    await TS_GENERATION_PROMISE();
  });

  test(`TS aliasing`, async () => {
    const witSource = await readFile(
      fileURLToPath(
        new URL(`./fixtures/wits/issue-365/issue-365.wit`, import.meta.url)
      ),
      "utf8"
    );
    const component = await componentNew(
      await componentEmbed({
        witSource,
        dummy: true,
      })
    );

    const { files } = await transpile(component, { name: "issue" });

    const dtsSource = new TextDecoder().decode(files["issue.d.ts"]);

    assert.ok(
      dtsSource.includes(
        `export type Bar = import('./interfaces/test-issue-types.js').Bar;`
      )
    );
  });

  test(`TS types`, async () => {
    const witSource = await readFile(
      fileURLToPath(
        new URL(`./fixtures/wits/issue-480/issue-480.wit`, import.meta.url)
      ),
      "utf8"
    );
    const component = await componentNew(
      await componentEmbed({
        witSource,
        dummy: true,
      })
    );

    const { files } = await transpile(component, { name: "issue" });

    const dtsSource = new TextDecoder().decode(
      files["interfaces/test-issue-types.d.ts"]
    );

    assert.ok(
      dtsSource.includes(
        `export function foobarbaz(): Array<Value | undefined>;`
      )
    );
  });
});
