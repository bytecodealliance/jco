import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";
import { rolldown } from "rolldown";
import { createWorkerThreads } from "../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads/core.js";
import type { WorkerThreadsImplementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads/types.js";
import * as denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads-host.js";

export function portable(): WorkerThreadsImplementation {
  return createWorkerThreads(denied);
}

/** Bundle a standalone provider exactly as published, with its adjacent bootstrap. */
export async function loadNodeProvider(): Promise<
  typeof import("../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads/host-node.js")
> {
  const output = await mkdtemp(join(tmpdir(), "jco-worker-provider-"));
  await writeFile(join(output, "package.json"), '{"type":"module"}\n');
  const source = new URL(
    "../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads/",
    import.meta.url,
  );
  const bundle = await rolldown({
    input: fileURLToPath(new URL("host-node.ts", source)),
    platform: "node",
  });
  try {
    await bundle.write({ file: join(output, "provider.mjs"), format: "esm" });
  } finally {
    await bundle.close();
  }
  await writeFile(
    join(output, "bootstrap.js"),
    stripTypeScriptTypes(await readFile(new URL("bootstrap.ts", source), "utf8")),
  );
  return import(pathToFileURL(join(output, "provider.mjs")).href);
}
