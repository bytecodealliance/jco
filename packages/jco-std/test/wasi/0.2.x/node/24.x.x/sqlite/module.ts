import * as native from "node:sqlite";
import { expect, test } from "vitest";
import { createSqlite } from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite/core.js";
import * as host from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite-host-node.js";
import * as denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/sqlite-host.js";
const sqlite = createSqlite(host);
test.concurrent("uses the pinned Node 24 oracle and exposes the native module and prototype contract", () => {
  expect(process.versions.node.split(".")[0]).toBe("24");
  expect(Object.keys(sqlite)).toEqual(Object.keys(native.default));
  expect(sqlite.constants).toEqual(native.constants);
  for (const name of ["DatabaseSync", "StatementSync", "Session"] as const) {
    expect(Object.getOwnPropertyNames(sqlite[name].prototype).sort()).toEqual(
      Object.getOwnPropertyNames(native[name].prototype).sort(),
    );
    for (const key of Object.getOwnPropertyNames(native[name].prototype)) {
      const a = Object.getOwnPropertyDescriptor(sqlite[name].prototype, key)!;
      const b = Object.getOwnPropertyDescriptor(native[name].prototype, key)!;
      expect([a.enumerable, a.configurable, a.writable]).toEqual([
        b.enumerable,
        b.configurable,
        b.writable,
      ]);
    }
  }
  const db = new sqlite.DatabaseSync(":memory:");
  try {
    expect(Object.keys(db)).toEqual(["isOpen", "isTransaction", "limits"]);
    expect(Object.getOwnPropertyNames(db.prepare("select 1"))).toEqual([
      "sourceSQL",
      "expandedSQL",
    ]);
  } finally {
    db.close();
  }
});
test.concurrent("denies database authority lazily and does not call callback arguments", () => {
  const api = createSqlite(denied);
  expect(api.constants.SQLITE_OK).toBe(0);
  expect(() => new api.DatabaseSync(":memory:")).toThrow(
    expect.objectContaining({ code: "ERR_JCO_SQLITE_ADAPTER_REQUIRED" }),
  );
  const db = new sqlite.DatabaseSync(":memory:");
  const poison = new Proxy(
    {},
    {
      get() {
        throw new Error("argument touched");
      },
    },
  );
  try {
    for (const method of ["function", "aggregate", "setAuthorizer"] as const) {
      expect(() => Reflect.apply(db[method], db, [poison, poison, poison])).toThrow(
        expect.objectContaining({ code: "ERR_JCO_SQLITE_CALLBACK_UNSUPPORTED" }),
      );
    }
    for (const Ctor of [sqlite.StatementSync, sqlite.Session]) {
      expect(() => Reflect.construct(Ctor as new () => unknown, [])).toThrow("Illegal constructor");
    }
  } finally {
    db.close();
  }
});
