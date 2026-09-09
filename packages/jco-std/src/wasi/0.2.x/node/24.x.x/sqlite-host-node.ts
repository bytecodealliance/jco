/** Opt-in SQLite authority. Delegates to Node v24.20.0 node:sqlite (src/node_sqlite.cc).
 * Database paths and extension paths refer to the host filesystem, not guest WASI.
 * This transport performs no SQL interpretation and never calls into guest JavaScript.
 */
import * as native from "node:sqlite";
import { Buffer } from "node:buffer";
import type * as Wit from "./sqlite/wire.js";
import {
  capture,
  serializeError,
  encode,
  decode,
  encodeRow,
  type ResultRow,
} from "./sqlite/codec.js";

// Runtime additions in 24.20.0 not yet present in the matching-major @types/node.
interface NativeDatabase extends native.DatabaseSync {
  limits: Record<string, number>;
  loadExtension(path: string, entryPoint?: string): void;
  serialize(dbName?: string): Uint8Array;
  deserialize(bytes: Uint8Array, options?: { dbName?: string }): void;
  prepare(sql: string, options?: Wit.StatementOptions): native.StatementSync;
}
const limitKeys: Record<Wit.LimitName, string> = {
  length: "length",
  "sql-length": "sqlLength",
  column: "column",
  "expr-depth": "exprDepth",
  "compound-select": "compoundSelect",
  "vdbe-op": "vdbeOp",
  "function-arg": "functionArg",
  attach: "attach",
  "like-pattern-length": "likePatternLength",
  "variable-number": "variableNumber",
  "trigger-depth": "triggerDepth",
};
function nativePath(p: Wit.Path): string | Buffer | URL {
  return p.tag === "url" ? new URL(p.val) : p.tag === "bytes" ? Buffer.from(p.val) : p.val;
}
function parameters(
  p: Wit.Bindings,
): [Record<string, native.SQLInputValue>, ...native.SQLInputValue[]] {
  const positional = p.positional.map(decode);
  const named: Record<string, native.SQLInputValue> = Object.create(null);
  for (const [k, v] of p.named ?? []) {
    named[k] = decode(v);
  }
  return [named, ...positional];
}
function changes(c: native.StatementResultingChanges): Wit.Changes {
  return { changes: encode(c.changes), lastInsertRowid: encode(c.lastInsertRowid) };
}
function optionalRow(row: ResultRow | undefined): Wit.Row | undefined {
  return row === undefined ? undefined : encodeRow(row);
}
function template(parts: string[]): TemplateStringsArray {
  return Object.assign(parts.slice(), { raw: parts.slice() });
}

export function openDatabase(path: Wit.Path, options: Wit.DatabaseOptions): Database {
  return capture(() => {
    const { statement, limits, ...rest } = options;
    const opts = {
      ...rest,
      ...statement,
      limits: Object.fromEntries(limits.map(([k, v]) => [limitKeys[k], v])),
    };
    return new Database(new native.DatabaseSync(nativePath(path), opts) as NativeDatabase);
  });
}
export async function backup(
  source: Database,
  path: Wit.Path,
  options: Wit.BackupOptions,
): Promise<number> {
  try {
    return await native.backup(
      source.native,
      nativePath(path),
      Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)),
    );
  } catch (error) {
    throw serializeError(error);
  }
}
export class Database implements Wit.Database {
  constructor(readonly native: NativeDatabase) {}
  open(): void {
    capture(() => this.native.open());
  }
  close(): void {
    capture(() => this.native.close());
  }
  isOpen(): boolean {
    return capture(() => this.native.isOpen);
  }
  isTransaction(): boolean {
    return capture(() => this.native.isTransaction);
  }
  exec(sql: string): void {
    capture(() => this.native.exec(sql));
  }
  prepare(sql: string, options: Wit.StatementOptions): Statement {
    return capture(() => new Statement(this.native.prepare(sql, options), this));
  }
  location(dbName?: string): string | undefined {
    return capture(() => this.native.location(dbName) ?? undefined);
  }
  getLimit(name: Wit.LimitName): number {
    return capture(() => this.native.limits[limitKeys[name]]);
  }
  setLimit(name: Wit.LimitName, value: number): void {
    capture(() => {
      this.native.limits[limitKeys[name]] = value;
    });
  }
  serialize(dbName?: string): Uint8Array {
    return capture(() => this.native.serialize(dbName));
  }
  deserialize(bytes: Uint8Array, dbName?: string): void {
    capture(() => this.native.deserialize(bytes, dbName === undefined ? {} : { dbName }));
  }
  createSession(options: Wit.SessionOptions): Session {
    return capture(
      () =>
        new Session(
          this.native.createSession(
            Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)),
          ),
          this,
        ),
    );
  }
  applyChangeset(bytes: Uint8Array): boolean {
    return capture(() => this.native.applyChangeset(bytes));
  }
  createTagStore(capacity: number): TagStore {
    return capture(() => new TagStore(this.native.createTagStore(capacity), this));
  }
  enableLoadExtension(allow: boolean): void {
    capture(() => this.native.enableLoadExtension(allow));
  }
  enableDefensive(active: boolean): void {
    capture(() => this.native.enableDefensive(active));
  }
  loadExtension(path: string, entryPoint?: string): void {
    capture(() => this.native.loadExtension(path, entryPoint));
  }
  [Symbol.dispose](): void {
    if (this.native.isOpen) {
      this.native.close();
    }
  }
}
export class Statement implements Wit.Statement {
  constructor(
    private native: native.StatementSync | undefined,
    readonly owner: Database,
  ) {}
  all(p: Wit.Bindings): Wit.Row[] {
    return capture(() => this.native!.all(...parameters(p)).map(encodeRow));
  }
  get(p: Wit.Bindings): Wit.Row | undefined {
    return capture(() => optionalRow(this.native!.get(...parameters(p))));
  }
  run(p: Wit.Bindings): Wit.Changes {
    return capture(() => changes(this.native!.run(...parameters(p))));
  }
  iterate(p: Wit.Bindings): Cursor {
    return capture(() => new Cursor(this.native!.iterate(...parameters(p)), this));
  }
  columns(): Wit.Column[] {
    return capture(() =>
      this.native!.columns().map((c) => ({
        name: c.name,
        column: c.column ?? undefined,
        database: c.database ?? undefined,
        table: c.table ?? undefined,
        type: c.type ?? undefined,
      })),
    );
  }
  sourceSql(): string {
    return capture(() => this.native!.sourceSQL);
  }
  expandedSql(): string {
    return capture(() => this.native!.expandedSQL);
  }
  setReadBigInts(v: boolean): void {
    capture(() => this.native!.setReadBigInts(v));
  }
  setReturnArrays(v: boolean): void {
    capture(() => this.native!.setReturnArrays(v));
  }
  setAllowBareNamedParameters(v: boolean): void {
    capture(() => this.native!.setAllowBareNamedParameters(v));
  }
  setAllowUnknownNamedParameters(v: boolean): void {
    capture(() => this.native!.setAllowUnknownNamedParameters(v));
  }
  [Symbol.dispose](): void {
    this.native = undefined;
  }
}
export class Cursor implements Wit.Cursor {
  constructor(
    private native: Iterator<ResultRow> | undefined,
    readonly owner: Statement | TagStore,
  ) {}
  next(): Wit.Row | undefined {
    return capture(() => {
      const result = this.native?.next();
      if (!result || result.done) {
        this.native = undefined;
        return undefined;
      }
      return encodeRow(result.value);
    });
  }
  close(): void {
    capture(() => {
      const iterator = this.native;
      this.native = undefined;
      iterator?.return?.();
    });
  }
  [Symbol.dispose](): void {
    this.close();
  }
}
export class Session implements Wit.Session {
  constructor(
    private native: native.Session,
    readonly owner: Database,
  ) {}
  changeset(): Uint8Array {
    return capture(() => this.native.changeset());
  }
  patchset(): Uint8Array {
    return capture(() => this.native.patchset());
  }
  close(): void {
    capture(() => this.native.close());
  }
  [Symbol.dispose](): void {
    this.native[Symbol.dispose]();
  }
}
export class TagStore implements Wit.TagStore {
  constructor(
    private native: native.SQLTagStore,
    readonly owner: Database,
  ) {}
  all(parts: string[], values: Wit.Value[]): Wit.Row[] {
    return capture(() => this.native.all(template(parts), ...values.map(decode)).map(encodeRow));
  }
  get(parts: string[], values: Wit.Value[]): Wit.Row | undefined {
    return capture(() => optionalRow(this.native.get(template(parts), ...values.map(decode))));
  }
  run(parts: string[], values: Wit.Value[]): Wit.Changes {
    return capture(() => changes(this.native.run(template(parts), ...values.map(decode))));
  }
  iterate(parts: string[], values: Wit.Value[]): Cursor {
    return capture(
      () => new Cursor(this.native.iterate(template(parts), ...values.map(decode)), this),
    );
  }
  size(): number {
    return capture(() => this.native.size);
  }
  capacity(): number {
    return capture(() => this.native.capacity);
  }
  clear(): void {
    capture(() => this.native.clear());
  }
  [Symbol.dispose](): void {
    this.native.clear();
  }
}
