import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVfs } from "../../../../../../src/wasi/0.2.x/node/26.x.x/vfs/core.js";
import type { VfsModule } from "../../../../../../src/wasi/0.2.x/node/26.x.x/vfs/core.js";
import * as denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs-host.js";
import * as host from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs-host-node.js";

export const vfs = createVfs(denied);

export const realVfs = createVfs(host);

export const memory = () => vfs.create({ emitExperimentalWarning: false });

/** Only the pinned release is an oracle; fixture expectations still run on Node 24. */
export function oracle(): VfsModule | undefined {
  if (process.version !== "v26.8.2") {
    return undefined;
  }
  return createRequire(import.meta.url)("node:vfs") as VfsModule;
}

export async function withDirectory<T>(run: (root: string) => T | Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "jco-vfs-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
