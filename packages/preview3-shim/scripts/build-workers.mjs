import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { rolldown } from "rolldown";

const workerNames = ["cli", "filesystem", "http", "tcp", "udp"];
const outputDir = fileURLToPath(new URL("../dist/nodejs/workers/", import.meta.url));
const relativeDependency =
  /(?:\b(?:import|export)\b[^;]*?\bfrom\s*|\bimport\s*\()\s*["']\.|\bnew\s+URL\(\s*["']\.\//;

for (const name of workerNames) {
  const bundle = await rolldown({
    input: fileURLToPath(new URL(`../dist/nodejs/workers/${name}-worker.js`, import.meta.url)),
    external: /^node:/,
    platform: "node",
  });
  try {
    await bundle.write({
      dir: outputDir,
      format: "esm",
      entryFileNames: `${name}-worker.bundle.js`,
      codeSplitting: false,
    });
  } finally {
    await bundle.close();
  }

  const workerUrl = new URL(`../dist/nodejs/workers/${name}-worker.bundle.js`, import.meta.url);
  const source = await readFile(workerUrl, "utf8");
  if (relativeDependency.test(source)) {
    throw new Error(`${name}-worker.bundle.js must not contain relative JavaScript dependencies`);
  }
}
