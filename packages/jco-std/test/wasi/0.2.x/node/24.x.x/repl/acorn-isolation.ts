// Keep acorn confined to the REPL and VM adapters, so unrelated builtins do not
// cause a component to carry a parser it never uses.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../../../../src/wasi/0.2.x/node/", import.meta.url));

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* sources(path);
    } else if (/\.(?:ts|js|mjs)$/.test(entry) && !entry.endsWith(".d.ts")) {
      yield path;
    }
  }
}

test.concurrent("only the repl and vm directories import acorn", () => {
  const importers: string[] = [];
  for (const file of sources(root)) {
    const text = readFileSync(file, "utf8");
    if (
      /from\s+["'](?:acorn|acorn-walk)["']|import\s*\(\s*["'](?:acorn|acorn-walk)["']/.test(text)
    ) {
      importers.push(relative(root, file));
    }
  }
  expect(importers.length).toBeGreaterThan(0);
  const allowed = ["repl", "vm"].map((directory) => join("24.x.x", directory) + "/");
  expect(importers.every((file) => allowed.some((prefix) => file.startsWith(prefix)))).toBe(true);
});
