import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { suite, test, assert } from "vitest";

import { exec, jcoPath } from "./helpers.js";

const DEBUG = false;

suite("Commands", async () => {
  const [tests, rawCommands] = await Promise.all([
    readFile("test/fixtures/commands/tests.json", "utf8").then(JSON.parse),
    readdir("test/fixtures/commands"),
  ]);
  const commands = rawCommands
    .filter((f) => f !== "tests.json")
    .map((f) => [f, f.replace(/\.(wat|wasm)$/, "")]);

  for (const [fixture, runName] of commands) {
    test.concurrent(runName, async () => {
      const { stdout, stderr } = await exec(
        jcoPath,
        "run",
        ...(DEBUG ? ["--jco-dir", `test/output/commands/${fixture}`] : []),
        resolve("test/fixtures/commands", fixture),
        ...(tests[runName]?.args || [])
      );
      assert.strictEqual(stderr, tests[runName]?.stderr || "");
      assert.strictEqual(stdout, tests[runName]?.stdout || "");
    });
  }
});
