import { DatabaseSync as NativeDatabase } from "node:sqlite";
import { expect, test } from "vitest";
import { createSqlite } from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite/core.js";
import * as host from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite-host-node.js";
const { DatabaseSync } = createSqlite(host);
function error(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (e) {
    const value = e as Error & { code?: string; errcode?: number; errstr?: string };
    return {
      name: value.name,
      code: value.code,
      message: value.message,
      errcode: value.errcode,
      errstr: value.errstr,
    };
  }
}
test.concurrent("database lifecycle, transactions, defaults, limits and native failures", () => {
  const db = new DatabaseSync(":memory:", { open: false });
  const oracle = new NativeDatabase(":memory:", { open: false });
  try {
    expect(db.isOpen).toBe(false);
    expect(error(() => db.exec("select 1"))).toEqual(error(() => oracle.exec("select 1")));
    db.open();
    oracle.open();
    expect(db.location()).toBe(oracle.location());
    for (const sql of [
      "CREATE TABLE t(id PRIMARY KEY, x)",
      "BEGIN",
      "INSERT INTO t VALUES (1,2)",
      "ROLLBACK",
      "INSERT INTO t VALUES (1,2)",
      "INSERT INTO t VALUES (1,3)",
      "bad sql",
      "SELECT * FROM missing",
    ]) {
      expect(error(() => db.exec(sql))).toEqual(error(() => oracle.exec(sql)));
      expect(db.isTransaction).toBe(oracle.isTransaction);
    }
    const original = db.limits.column;
    db.limits.column = 10;
    expect(db.limits.column).toBe(10);
    db.limits.column = Infinity;
    expect(db.limits.column).toBe(original);
    expect(error(() => db.enableLoadExtension(true))).toEqual(
      error(() => oracle.enableLoadExtension(true)),
    );
    expect(error(() => db.loadExtension("missing"))).toEqual(
      error(() => oracle.loadExtension("missing")),
    );
    db.enableDefensive(false);
    db.enableDefensive(true);
    db.close();
    oracle.close();
    expect(error(() => db.close())).toEqual(error(() => oracle.close()));
    db[Symbol.dispose]();
    db.open();
    expect(db.isOpen).toBe(true);
  } finally {
    db[Symbol.dispose]();
    oracle[Symbol.dispose]();
  }
});
test.concurrent("serialization replaces the database and invalidates prepared statements", () => {
  const db = new DatabaseSync(":memory:");
  const other = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE t(x); INSERT INTO t VALUES (123)");
    const stale = other.prepare("SELECT 1");
    other.deserialize(db.serialize());
    expect(other.prepare("SELECT x FROM t").get()).toEqual({ x: 123 });
    expect(() => stale.get()).toThrow();
  } finally {
    db.close();
    other.close();
  }
});
test.concurrent("sessions apply changesets, patchsets and conflict defaults", () => {
  const source = new DatabaseSync(":memory:");
  const target = new DatabaseSync(":memory:");
  try {
    for (const db of [source, target]) {
      db.exec("CREATE TABLE t(id INTEGER PRIMARY KEY, x)");
    }
    const session = source.createSession({ table: "t", db: "main" });
    source.prepare("INSERT INTO t VALUES (?, ?)").run(1, "one");
    expect(target.applyChangeset(session.changeset())).toBe(true);
    expect(target.applyChangeset(session.patchset())).toBe(false);
    expect(target.prepare("SELECT * FROM t").all()).toEqual([{ id: 1, x: "one" }]);
    session[Symbol.dispose]();
    session[Symbol.dispose]();
    expect(() => session.changeset()).toThrow();
  } finally {
    source.close();
    target.close();
  }
});

test.concurrent("validates constructor and option types before canonical ABI coercion", () => {
  for (const args of [
    [123],
    [":memory:", undefined],
    [":memory:", null],
    [":memory:", { open: 1 }],
    [":memory:", { readOnly: "yes" }],
    [":memory:", { timeout: "1" }],
  ]) {
    expect(error(() => Reflect.construct(DatabaseSync, args))).toEqual(
      error(() => Reflect.construct(NativeDatabase, args)),
    );
  }
});

test.concurrent("matches native argument errors for database and statement methods", () => {
  const db = new DatabaseSync(":memory:");
  const native = new NativeDatabase(":memory:");
  try {
    for (const name of [
      "exec",
      "prepare",
      "location",
      "serialize",
      "deserialize",
      "enableDefensive",
    ] as const) {
      const a = Reflect.get(db, name) as (...args: unknown[]) => unknown;
      const b = Reflect.get(native, name) as (...args: unknown[]) => unknown;
      expect(error(() => a.call(db, 1))).toEqual(error(() => b.call(native, 1)));
    }
    const stmt = db.prepare("select 1");
    const oracle = native.prepare("select 1");
    for (const name of [
      "setReadBigInts",
      "setReturnArrays",
      "setAllowBareNamedParameters",
      "setAllowUnknownNamedParameters",
    ] as const) {
      expect(error(() => Reflect.apply(stmt[name], stmt, [1]))).toEqual(
        error(() => Reflect.apply(oracle[name], oracle, [1])),
      );
    }
    expect(error(() => db.createSession({ table: undefined }))).toEqual(
      error(() => native.createSession({ table: undefined })),
    );
  } finally {
    db.close();
    native.close();
  }
});
