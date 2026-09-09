// acorn is a dependency of `node:repl` alone. Nothing else in jco-std may import it, or every
// component would carry a parser it never uses.
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

test.concurrent("only the repl directory imports acorn", () => {
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
  expect(importers.every((file) => file.startsWith(join("24.x.x", "repl") + "/"))).toBe(true);
});
