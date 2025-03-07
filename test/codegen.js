import { readFile } from "node:fs/promises";

import { componentNew, componentEmbed, transpile } from "@bytecodealliance/jco";
import { suite, test, assert } from "vitest";
import { fileURLToPath } from "node:url";

import { exec, jcoPath } from "./helpers.js";
import { getDefaultComponentFixtures, ESLINT_PATH } from "./common.js";

suite(`Transpiler codegen`, async () => {
  const fixtures = await getDefaultComponentFixtures();
  for (const fixture of fixtures) {
    const testName = fixture.replace(/(\.component)?\.(wasm|wat)$/, "");

    test.concurrent(`${testName} transpile & lint`, async () => {
      const flags = await readFixtureFlags(
        fileURLToPath(new URL(`./runtime/${testName}.ts`, import.meta.url))
      );
      var { stderr } = await exec(
        jcoPath,
        "transpile",
        fileURLToPath(
          new URL(`./fixtures/components/${fixture}`, import.meta.url)
        ),
        "--name",
        testName,
        ...flags,
        "-o",
        fileURLToPath(new URL(`./output/${testName}`, import.meta.url))
      );
      assert.strictEqual(stderr, "");

      if (flags.includes("--js")) return;

      const eslintOutput = await exec(
        ESLINT_PATH,
        fileURLToPath(
          new URL(`./output/${testName}/${testName}.js`, import.meta.url)
        ),
        "-c",
        fileURLToPath(new URL(`./eslintrc.cjs`, import.meta.url))
      );
      assert.strictEqual(eslintOutput.stderr, "");
    });
  }
});

suite(`Naming`, () => {
  test(`Resource deduping`, async () => {
    const component = await componentNew(
      await componentEmbed({
        witSource: await readFile(
          fileURLToPath(
            new URL(
              `./fixtures/wits/resource-naming/resource-naming.wit`,
              import.meta.url
            )
          ),
          "utf8"
        ),
        dummy: true,
        metadata: [
          ["language", [["javascript", ""]]],
          ["processed-by", [["dummy-gen", "test"]]],
        ],
      })
    );

    const { files } = await transpile(component, { name: "resource-naming" });

    const bindingsSource = new TextDecoder().decode(
      files["resource-naming.js"]
    );

    assert.isOk(bindingsSource.includes("class Thing$1{"));
    assert.isOk(bindingsSource.includes("Thing: Thing$1"));
  });
});

/** Read the flags that should be set before running a given codegen fixture */
async function readFixtureFlags(fixturePath) {
  try {
    var source = await readFile(fixturePath, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return [];
    throw e;
  }

  const firstLine = source.split("\n")[0];
  if (firstLine.startsWith("// Flags:")) {
    return firstLine.slice(9).trim().split(" ");
  }

  return [];
}
