import { strictEqual } from "node:assert";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { exec, jcoPath } from "./helpers.js";

const args = {
  "dir.virt": ["/foo"],
};

export async function commandsTest() {
  suite("Commands", async () => {
    for (const fixture of readdirSync("test/fixtures/commands")) {
      const runName = fixture.replace(/\.(wat|wasm)$/, "");
      test(runName, async () => {
        const { stdout, stderr } = await exec(
          jcoPath,
          "run",
          resolve("test/fixtures/commands", fixture),
          ...(args[runName] || [])
        );

        strictEqual(stderr, "");
        strictEqual(stdout, "Listing directory: /foo\n - .\n - ..\n - foo\n");
      });
    }
  });
}
