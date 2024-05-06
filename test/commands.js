import { strictEqual } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec, jcoPath } from "./helpers.js";

const DEBUG = false;

const tests = JSON.parse(readFileSync('test/fixtures/commands/tests.json', 'utf8'));

export async function commandsTest() {
  suite("Commands", async () => {
    for (const fixture of readdirSync("test/fixtures/commands")) {
      if (fixture === 'tests.json') continue;
      const runName = fixture.replace(/\.(wat|wasm)$/, "");
      test(runName, async () => {
        const { stdout, stderr } = await exec(
          jcoPath,
          "run",
          ...DEBUG ? ["--jco-dir", `test/output/commands/${fixture}`] : [],
          resolve("test/fixtures/commands", fixture),
          ...(tests[runName]?.args || [])
        );
        strictEqual(stderr, tests[runName]?.stderr || '');
        strictEqual(stdout, tests[runName]?.stdout || '');
      });
    }
  });
}
