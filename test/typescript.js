import { exec } from "./helpers.js";
import { strictEqual } from "node:assert";
import {
  transpile,
  componentNew,
  componentEmbed,
} from "../src/api.js";
import { readFile } from "node:fs/promises";
import { ok } from "node:assert";

const tscPath = "node_modules/typescript/bin/tsc";

// always do TS generation
let promise;
export function tsGenerationPromise() {
  if (promise) return promise;
  return (promise = (async () => {
    var { stderr } = await exec(tscPath, "-p", "test/tsconfig.json");
    strictEqual(stderr, "");
  })());
}

// TypeScript tests _must_ run after all codegen to complete successfully
// This is due to type checking against generated bindings
export function tsTest() {
  suite(`TypeScript`, () => {
    test("Verify Typescript output", async () => {
      await tsGenerationPromise();
    });

    test(`TS aliasing`, async () => {
      const component = await componentNew(
        await componentEmbed({
          witSource: await readFile(
            `test/fixtures/wits/issue-365/issue-365.wit`,
            "utf8"
          ),
          dummy: true,
        })
      );

      const { files } = await transpile(component, { name: "issue" });

      const dtsSource = new TextDecoder().decode(files["issue.d.ts"]);

      ok(
        dtsSource.includes(
          `import type { Bar } from './interfaces/test-issue-types.js';`
        )
      );
    });

    test(`TS types`, async () => {
      const component = await componentNew(
        await componentEmbed({
          witSource: await readFile(
            `test/fixtures/wits/issue-480/issue-480.wit`,
            "utf8"
          ),
          dummy: true,
        }),
      );

      const { files } = await transpile(component, { name: "issue" });

      const dtsSource = new TextDecoder().decode(
        files["interfaces/test-issue-types.d.ts"]
      );

      ok(
        dtsSource.includes(
          `export function foobarbaz(): Array<Value | undefined>;`
        )
      );
    });
  });
}
