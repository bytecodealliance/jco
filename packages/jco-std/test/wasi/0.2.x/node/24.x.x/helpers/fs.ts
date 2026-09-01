import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFs } from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs/callbacks.js";
import { createFsCore } from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs/core.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs-host-node.js";
import { createFsPromises } from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs/promises.js";

export const core = createFsCore(nodeHost);
export const promises = createFsPromises(core);
export const fs = createFs(core, promises);

export async function withFsFixture<T>(run: (root: string) => Promise<T> | T): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "jco-node-fs-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
