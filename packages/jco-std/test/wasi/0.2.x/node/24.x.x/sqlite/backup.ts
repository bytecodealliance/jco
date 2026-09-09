import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { createSqlite } from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite/core.js";
import * as host from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite-host-node.js";
const { DatabaseSync, backup } = createSqlite(host);

test.concurrent("backs up asynchronously through explicit host filesystem authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "sqlite-"));
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE t(x); INSERT INTO t VALUES (42)");
    const destination = pathToFileURL(join(root, "copy.db"));
    const promise = backup(db, destination, { rate: 1 });
    expect(promise).toBeInstanceOf(Promise);
    expect(await promise).toBeGreaterThan(0);
    const copy = new DatabaseSync(new TextEncoder().encode(join(root, "copy.db")), {
      readOnly: true,
    });
    try {
      expect(copy.prepare("SELECT x FROM t").get()).toEqual({ x: 42 });
      expect(() => copy.exec("DELETE FROM t")).toThrow();
    } finally {
      copy.close();
    }
    await expect(backup(db, join(root, "absent", "copy.db"))).rejects.toMatchObject({
      code: "ERR_SQLITE_ERROR",
    });
    await expect(
      backup(db, destination, {
        progress() {
          throw new Error("callback called");
        },
      }),
    ).rejects.toMatchObject({ code: "ERR_JCO_SQLITE_CALLBACK_UNSUPPORTED" });
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
