/** Node v24.20.0 API adapter for the native implementation in src/node_sqlite.cc
 * (71b8b174857e25106d39b61a9e6f30d927da8b01). The host owns SQLite execution;
 * this layer preserves JS values, instance identity, and resource lifetimes.
 */
import type * as Wit from "./wire.js";
import type * as Public from "./types.js";
import {
  bindings,
  call,
  decode,
  decodeRow,
  encode,
  fail,
  path,
  restoreError,
  type ResultRow,
} from "./codec.js";
import { constants } from "./constants.js";
const limitNames: Record<keyof Public.Limits, Wit.LimitName> = {
  length: "length",
  sqlLength: "sql-length",
  column: "column",
  exprDepth: "expr-depth",
  compoundSelect: "compound-select",
  vdbeOp: "vdbe-op",
  functionArg: "function-arg",
  attach: "attach",
  likePatternLength: "like-pattern-length",
  variableNumber: "variable-number",
  triggerDepth: "trigger-depth",
};
function object(value: unknown): Record<string, unknown> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    fail("ERR_INVALID_ARG_TYPE", 'The "options" argument must be an object.');
  }
  return value as Record<string, unknown>;
}
function string(value: unknown, name = "sql"): string {
  if (typeof value !== "string") {
    fail("ERR_INVALID_ARG_TYPE", `The "${name}" argument must be a string.`);
  }
  return value;
}
function bool(value: unknown, name = "enabled"): boolean {
  if (typeof value !== "boolean") {
    fail("ERR_INVALID_ARG_TYPE", `The "${name}" argument must be a boolean.`);
  }
  return value;
}
function bytes(value: unknown, name = "changeset"): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    fail("ERR_INVALID_ARG_TYPE", `The "${name}" argument must be a Uint8Array.`);
  }
  return value;
}
function statementOptions(value: Record<string, unknown>): Wit.StatementOptions {
  const result: Wit.StatementOptions = {};
  for (const key of [
    "readBigInts",
    "returnArrays",
    "allowBareNamedParameters",
    "allowUnknownNamedParameters",
  ] as const) {
    if (value[key] !== undefined) {
      result[key] = bool(value[key], `options.${key}`);
    }
  }
  return result;
}
function unsupported(name: string): never {
  return fail(
    "ERR_JCO_SQLITE_CALLBACK_UNSUPPORTED",
    `node:sqlite ${name} is not supported: synchronous SQL callbacks cannot re-enter a WebAssembly component.`,
    "Error",
  );
}
function row(value: Wit.Row | undefined): ResultRow | undefined {
  return value == null ? undefined : decodeRow(value);
}
function changes(value: Wit.Changes): Public.Changes {
  return {
    changes: decode(value.changes) as number | bigint,
    lastInsertRowid: decode(value.lastInsertRowid) as number | bigint,
  };
}
function ownGetter(target: object, key: PropertyKey, get: () => unknown): void {
  Object.defineProperty(target, key, { get, enumerable: true });
}

export function createSqlite(host: Public.SqliteHost): Public.SqliteModule {
  const databases = new WeakMap<Public.DatabaseSync, Wit.Database>();
  const secret = Symbol("sqlite construction");
  function iterator(cursor: Wit.Cursor, owner: object): IterableIterator<ResultRow> {
    let done = false;
    const result: IterableIterator<ResultRow> = {
      [Symbol.iterator]() {
        return this;
      },
      next() {
        if (done) {
          return { done: true, value: undefined };
        }
        const value = call(() => cursor.next());
        if (value == null) {
          done = true;
          call(() => cursor[Symbol.dispose]?.());
          return { done: true, value: undefined };
        }
        return { done: false, value: decodeRow(value) };
      },
      return() {
        if (!done) {
          done = true;
          call(() => cursor.close());
          call(() => cursor[Symbol.dispose]?.());
        }
        return { done: true, value: undefined };
      },
    };
    // A real reference is needed here: a no-op expression can be removed by bundling.
    Object.defineProperty(result, Symbol("sqlite owner"), { value: owner });
    return result;
  }
  class DatabaseSync implements Public.DatabaseSync {
    #resource: Wit.Database;
    declare readonly isOpen: boolean;
    declare readonly isTransaction: boolean;
    declare readonly limits: Public.Limits;
    constructor(filename: string | Uint8Array | URL, options?: Public.DatabaseSyncOptions) {
      const opts = arguments.length < 2 ? {} : object(options);
      const wire: Wit.DatabaseOptions = { statement: statementOptions(opts), limits: [] };
      for (const key of [
        "open",
        "readOnly",
        "enableForeignKeyConstraints",
        "enableDoubleQuotedStringLiterals",
        "allowExtension",
        "defensive",
      ] as const) {
        if (opts[key] !== undefined) {
          wire[key] = bool(opts[key], `options.${key}`);
        }
      }
      if (opts.timeout !== undefined) {
        if (typeof opts.timeout !== "number") {
          fail("ERR_INVALID_ARG_TYPE", 'The "options.timeout" argument must be an integer.');
        }
        wire.timeout = opts.timeout;
      }
      if (opts.limits !== undefined) {
        const limits = object(opts.limits);
        for (const [key, name] of Object.entries(limitNames)) {
          if (limits[key] !== undefined) {
            wire.limits.push([name, validateLimit(limits[key])]);
          }
        }
      }
      this.#resource = call(() => host.openDatabase(path(filename), wire));
      databases.set(this, this.#resource);
      ownGetter(this, "isOpen", () => call(() => this.#resource.isOpen()));
      ownGetter(this, "isTransaction", () => call(() => this.#resource.isTransaction()));
      const limits = {} as Public.Limits;
      for (const [key, name] of Object.entries(limitNames)) {
        Object.defineProperty(limits, key, {
          enumerable: true,
          get: () => call(() => this.#resource.getLimit(name)),
          set: (value: unknown) => call(() => this.#resource.setLimit(name, validateLimit(value))),
        });
      }
      ownGetter(this, "limits", () => {
        if (!this.isOpen) {
          fail("ERR_INVALID_STATE", "database is not open", "Error");
        }
        return limits;
      });
    }
    open(): void {
      call(() => this.#resource.open());
    }
    close(): void {
      call(() => this.#resource.close());
    }
    prepare(sql: string, options?: Public.StatementOptions): Public.StatementSync {
      return new StatementSync(
        secret,
        call(() =>
          this.#resource.prepare(
            string(sql),
            statementOptions(options === undefined ? {} : object(options)),
          ),
        ),
        this,
      );
    }
    exec(sql: string): void {
      call(() => this.#resource.exec(string(sql)));
    }
    function(..._args: unknown[]): never {
      return unsupported("DatabaseSync.function");
    }
    createTagStore(maxSize = 1000): Public.SQLTagStore {
      return new SQLTagStore(
        call(() => this.#resource.createTagStore(typeof maxSize === "number" ? maxSize : 1000)),
        this,
      );
    }
    location(dbName?: string): string | null {
      return (
        call(() =>
          this.#resource.location(dbName === undefined ? undefined : string(dbName, "dbName")),
        ) ?? null
      );
    }
    aggregate(..._args: unknown[]): never {
      return unsupported("DatabaseSync.aggregate");
    }
    createSession(options: Public.SessionOptions = {}): Public.Session {
      const o = object(options);
      return new Session(
        secret,
        call(() =>
          this.#resource.createSession({
            table: "table" in o ? string(o.table, "options.table") : undefined,
            db: "db" in o ? string(o.db, "options.db") : undefined,
          }),
        ),
        this,
      );
    }
    applyChangeset(changeset: Uint8Array, options: Public.ApplyChangesetOptions = {}): boolean {
      const o = object(options);
      if (o.filter !== undefined || o.onConflict !== undefined) {
        unsupported("DatabaseSync.applyChangeset callbacks");
      }
      return call(() => this.#resource.applyChangeset(bytes(changeset)));
    }
    enableLoadExtension(allow: boolean): void {
      call(() => this.#resource.enableLoadExtension(bool(allow, "allow")));
    }
    enableDefensive(active: boolean): void {
      call(() => this.#resource.enableDefensive(bool(active, "active")));
    }
    loadExtension(filename: string, entryPoint?: string): void {
      call(() =>
        this.#resource.loadExtension(
          string(filename, "path"),
          entryPoint === undefined ? undefined : string(entryPoint, "entryPoint"),
        ),
      );
    }
    serialize(dbName?: string): Uint8Array {
      return new Uint8Array(
        call(() =>
          this.#resource.serialize(dbName === undefined ? undefined : string(dbName, "dbName")),
        ),
      );
    }
    deserialize(data: Uint8Array, options: { dbName?: string } = {}): void {
      const o = object(options);
      call(() =>
        this.#resource.deserialize(
          bytes(data, "buffer"),
          o.dbName === undefined ? undefined : string(o.dbName, "dbName"),
        ),
      );
    }
    setAuthorizer(..._args: unknown[]): never {
      return unsupported("DatabaseSync.setAuthorizer");
    }
    [Symbol.dispose](): void {
      if (this.isOpen) {
        this.close();
      }
    }
  }
  class StatementSync implements Public.StatementSync {
    declare readonly sourceSQL: string;
    declare readonly expandedSQL: string;
    #resource: Wit.Statement;
    #owner: DatabaseSync;
    constructor(token: symbol, resource: Wit.Statement, owner: DatabaseSync) {
      if (token !== secret) {
        throw new TypeError("Illegal constructor");
      }
      this.#resource = resource;
      this.#owner = owner;
      ownGetter(this, "sourceSQL", () => call(() => resource.sourceSql()));
      ownGetter(this, "expandedSQL", () => call(() => resource.expandedSql()));
    }
    iterate(...args: Public.Parameters): IterableIterator<ResultRow> {
      return iterator(
        call(() => this.#resource.iterate(bindings(args))),
        this,
      );
    }
    all(...args: Public.Parameters): ResultRow[] {
      return call(() => this.#resource.all(bindings(args))).map(decodeRow);
    }
    get(...args: Public.Parameters): ResultRow | undefined {
      return row(call(() => this.#resource.get(bindings(args))));
    }
    run(...args: Public.Parameters): Public.Changes {
      return changes(call(() => this.#resource.run(bindings(args))));
    }
    columns(): Public.Column[] {
      return call(() => this.#resource.columns()).map((c) => ({
        name: c.name,
        column: c.column ?? null,
        database: c.database ?? null,
        table: c.table ?? null,
        type: c.type ?? null,
      }));
    }
    setAllowBareNamedParameters(enabled: boolean): void {
      call(() =>
        this.#resource.setAllowBareNamedParameters(bool(enabled, "allowBareNamedParameters")),
      );
    }
    setAllowUnknownNamedParameters(enabled: boolean): void {
      call(() => this.#resource.setAllowUnknownNamedParameters(bool(enabled)));
    }
    setReadBigInts(enabled: boolean): void {
      call(() => this.#resource.setReadBigInts(bool(enabled, "readBigInts")));
    }
    setReturnArrays(enabled: boolean): void {
      call(() => this.#resource.setReturnArrays(bool(enabled, "returnArrays")));
    }
  }
  class Session implements Public.Session {
    #resource: Wit.Session;
    #owner: DatabaseSync;
    #closed = false;
    constructor(token: symbol, resource: Wit.Session, owner: DatabaseSync) {
      if (token !== secret) {
        throw new TypeError("Illegal constructor");
      }
      this.#resource = resource;
      this.#owner = owner;
    }
    changeset(): Uint8Array {
      return new Uint8Array(call(() => this.#resource.changeset()));
    }
    patchset(): Uint8Array {
      return new Uint8Array(call(() => this.#resource.patchset()));
    }
    close(): void {
      call(() => this.#resource.close());
      this.#closed = true;
    }
    [Symbol.dispose](): void {
      if (!this.#closed) {
        this.close();
      }
    }
  }
  class SQLTagStore implements Public.SQLTagStore {
    #resource: Wit.TagStore;
    #owner: DatabaseSync;
    declare readonly capacity: number;
    declare readonly size: number;
    declare readonly db: DatabaseSync;
    constructor(resource: Wit.TagStore, owner: DatabaseSync) {
      this.#resource = resource;
      this.#owner = owner;
      ownGetter(this, "capacity", () => call(() => resource.capacity()));
      ownGetter(this, "db", () => owner);
      ownGetter(this, "size", () => call(() => resource.size()));
    }
    get(parts: TemplateStringsArray, ...values: Public.SQLInputValue[]): ResultRow | undefined {
      return row(call(() => this.#resource.get(template(parts), values.map(encode))));
    }
    all(parts: TemplateStringsArray, ...values: Public.SQLInputValue[]): ResultRow[] {
      return call(() => this.#resource.all(template(parts), values.map(encode))).map(decodeRow);
    }
    iterate(
      parts: TemplateStringsArray,
      ...values: Public.SQLInputValue[]
    ): IterableIterator<ResultRow> {
      return iterator(
        call(() => this.#resource.iterate(template(parts), values.map(encode))),
        this,
      );
    }
    run(parts: TemplateStringsArray, ...values: Public.SQLInputValue[]): Public.Changes {
      return changes(call(() => this.#resource.run(template(parts), values.map(encode))));
    }
    clear(): void {
      call(() => this.#resource.clear());
    }
  }
  function template(parts: TemplateStringsArray): string[] {
    if (!Array.isArray(parts)) {
      fail("ERR_INVALID_ARG_TYPE", 'The "sql" argument must be a template literal.');
    }
    return parts.map((v) => string(v));
  }
  function validateLimit(value: unknown): number {
    if (
      typeof value !== "number" ||
      (value !== Infinity && (!Number.isInteger(value) || value > 2147483647))
    ) {
      fail("ERR_INVALID_ARG_TYPE", "Limit value must be a non-negative integer or Infinity.");
    }
    if (value < 0) {
      fail("ERR_OUT_OF_RANGE", "Limit value must be non-negative.", "RangeError");
    }
    return value;
  }
  async function backup(
    source: Public.DatabaseSync,
    filename: string | Uint8Array | URL,
    options: Public.BackupOptions = {},
  ): Promise<number> {
    const o = object(options);
    if (o.progress !== undefined) {
      unsupported("backup progress callback");
    }
    const resource = databases.get(source);
    if (!resource) {
      fail("ERR_INVALID_ARG_TYPE", 'The "sourceDb" argument must be a DatabaseSync.');
    }
    const opts: Wit.BackupOptions = {};
    for (const key of ["source", "target"] as const) {
      if (o[key] !== undefined) {
        opts[key] = string(o[key], `options.${key}`);
      }
    }
    if (o.rate !== undefined) {
      if (typeof o.rate !== "number") {
        fail("ERR_INVALID_ARG_TYPE", 'The "options.rate" argument must be an integer.');
      }
      opts.rate = o.rate;
    }
    try {
      return await host.backup(resource, path(filename), opts);
    } catch (error) {
      throw restoreError(error);
    }
  }
  // Native Node method descriptors are enumerable, unlike JavaScript class methods.
  for (const ctor of [DatabaseSync, StatementSync, Session, SQLTagStore]) {
    for (const key of Reflect.ownKeys(ctor.prototype)) {
      if (key !== "constructor") {
        Object.defineProperty(ctor.prototype, key, { enumerable: true });
      }
    }
  }
  return { DatabaseSync, StatementSync, Session, constants: { ...constants }, backup };
}
