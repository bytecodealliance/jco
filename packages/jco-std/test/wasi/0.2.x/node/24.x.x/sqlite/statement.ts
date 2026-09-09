import { DatabaseSync as NativeDatabase } from "node:sqlite";
import { expect, test } from "vitest";
import { createSqlite } from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite/core.js";
import * as host from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite-host-node.js";
import { encode } from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite/codec.js";
const { DatabaseSync } = createSqlite(host);
test.concurrent("binding values, metadata and result modes agree with native SQLite", () => {
  const db = new DatabaseSync(":memory:");
  const oracle = new NativeDatabase(":memory:");
  try {
    for (const value of [
      null,
      1.5,
      NaN,
      Infinity,
      -Infinity,
      "a\0b",
      123n,
      new Uint8Array([0, 255]),
      new DataView(new Uint8Array([8, 9, 10]).buffer, 1, 1),
    ]) {
      const stmt = db.prepare("SELECT ? AS value");
      const native = oracle.prepare("SELECT ? AS value");
      expect(stmt.get(value)).toEqual(native.get(value));
      expect(stmt.expandedSQL).toBe(native.expandedSQL);
      expect(stmt.columns()).toEqual(native.columns());
    }
    expect(db.prepare('SELECT 1 AS "__proto__", 2 AS x, 3 AS x').get()).toEqual(
      oracle.prepare('SELECT 1 AS "__proto__", 2 AS x, 3 AS x').get(),
    );
    const stmt = db.prepare("SELECT $a AS a, ? AS b");
    expect(stmt.get({ a: 5 }, 6)).toEqual({ a: 5, b: 6 });
    stmt.setAllowBareNamedParameters(false);
    expect(() => stmt.get({ a: 5 }, 6)).toThrow();
    expect(stmt.get({ $a: 5 }, 6)).toEqual({ a: 5, b: 6 });
    stmt.setAllowUnknownNamedParameters(true);
    expect(stmt.get({ $a: 5, unused: 7 }, 6)).toEqual({ a: 5, b: 6 });
    stmt.setReturnArrays(true);
    stmt.setReadBigInts(true);
    expect(stmt.get({ $a: 5n }, 6n)).toEqual([5n, 6n]);
    const big = db.prepare("SELECT ? AS n", { readBigInts: true });
    expect(big.get((1n << 63n) - 1n)).toEqual({ n: (1n << 63n) - 1n });
    expect(() => big.get(1n << 63n)).toThrow();
    expect(encode(new Uint16Array([1])).tag).toBe("blob");
  } finally {
    db.close();
    oracle.close();
  }
});
test.concurrent("iteration is lazy and early return releases the active statement", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE t(x); INSERT INTO t VALUES (1),(2),(3)");
    const stmt = db.prepare("UPDATE t SET x=x+1 RETURNING x");
    const iter = stmt.iterate();
    expect(db.prepare("SELECT sum(x) AS n FROM t").get()).toEqual({ n: 6 });
    expect(iter.next()).toEqual({ done: false, value: { x: 2 } });
    iter.return!();
    expect(iter.next().done).toBe(true);
    expect(db.prepare("SELECT sum(x) AS n FROM t").get()).toEqual({ n: 9 });
    expect([...db.prepare("SELECT x FROM t ORDER BY x").iterate()]).toEqual([
      { x: 2 },
      { x: 3 },
      { x: 4 },
    ]);
  } finally {
    db.close();
  }
});
test.concurrent("tag store binds safely and maintains its LRU capacity", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const sql = db.createTagStore(2);
    for (const value of [1, 2, 3]) {
      expect(sql.get`SELECT ${value} AS x`).toEqual({ x: value });
    }
    expect(sql.size).toBe(1);
    expect(sql.db).toBe(db);
    expect(sql.capacity).toBe(2);
    expect(sql.all`SELECT ${"'; DROP TABLE t; --"} AS x`).toEqual([{ x: "'; DROP TABLE t; --" }]);
    expect([...sql.iterate`SELECT 1 AS x`]).toEqual([{ x: 1 }]);
    void sql.run`CREATE TABLE t(x)`;
    expect(sql.size).toBe(2);
    sql.clear();
    expect(sql.size).toBe(0);
  } finally {
    db.close();
  }
});
