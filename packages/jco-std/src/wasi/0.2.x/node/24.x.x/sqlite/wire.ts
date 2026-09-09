// Resource and value types generated from jco:node/sqlite@0.1.0.
export interface Error {
  name: string;
  message: string;
  code?: string;
  errcode?: number;
  errstr?: string;
}
export type Path = PathText | PathBytes | PathUrl;
export interface PathText {
  tag: "text";
  val: string;
}
export interface PathBytes {
  tag: "bytes";
  val: Uint8Array;
}
export interface PathUrl {
  tag: "url";
  val: string;
}
/**
 * Numbers and bigints stay distinct; blobs are copied across the boundary.
 */
export type Value = ValueNull | ValueNumber | ValueBigint | ValueText | ValueBlob;
export interface ValueNull {
  tag: "null";
}
export interface ValueNumber {
  tag: "number";
  val: number;
}
export interface ValueBigint {
  tag: "bigint";
  val: bigint;
}
export interface ValueText {
  tag: "text";
  val: string;
}
export interface ValueBlob {
  tag: "blob";
  val: Uint8Array;
}
export type Row = RowObject | RowArray;
export interface RowObject {
  tag: "object";
  val: Array<[string, Value]>;
}
export interface RowArray {
  tag: "array";
  val: Array<Value>;
}
export interface Bindings {
  named?: Array<[string, Value]>;
  positional: Array<Value>;
}
export interface Changes {
  changes: Value;
  lastInsertRowid: Value;
}
export interface Column {
  column?: string;
  database?: string;
  name: string;
  table?: string;
  type?: string;
}
/**
 * # Variants
 *
 * ## `"length"`
 *
 * ## `"sql-length"`
 *
 * ## `"column"`
 *
 * ## `"expr-depth"`
 *
 * ## `"compound-select"`
 *
 * ## `"vdbe-op"`
 *
 * ## `"function-arg"`
 *
 * ## `"attach"`
 *
 * ## `"like-pattern-length"`
 *
 * ## `"variable-number"`
 *
 * ## `"trigger-depth"`
 */
export type LimitName =
  | "length"
  | "sql-length"
  | "column"
  | "expr-depth"
  | "compound-select"
  | "vdbe-op"
  | "function-arg"
  | "attach"
  | "like-pattern-length"
  | "variable-number"
  | "trigger-depth";
export interface StatementOptions {
  readBigInts?: boolean;
  returnArrays?: boolean;
  allowBareNamedParameters?: boolean;
  allowUnknownNamedParameters?: boolean;
}
export interface DatabaseOptions {
  open?: boolean;
  readOnly?: boolean;
  enableForeignKeyConstraints?: boolean;
  enableDoubleQuotedStringLiterals?: boolean;
  allowExtension?: boolean;
  timeout?: number;
  defensive?: boolean;
  statement: StatementOptions;
  limits: Array<[LimitName, number]>;
}
export interface SessionOptions {
  table?: string;
  db?: string;
}
export interface BackupOptions {
  source?: string;
  target?: string;
  rate?: number;
}

export interface Cursor extends Disposable {
  /**
   * This type does not have a public constructor.
   */

  next(): Row | undefined;
  close(): void;
  [Symbol.dispose](): void;
}

export interface Database extends Disposable {
  /**
   * This type does not have a public constructor.
   */

  open(): void;
  close(): void;
  isOpen(): boolean;
  isTransaction(): boolean;
  exec(sql: string): void;
  prepare(sql: string, options: StatementOptions): Statement;
  location(dbName: string | undefined): string | undefined;
  getLimit(name: LimitName): number;
  setLimit(name: LimitName, value: number): void;
  serialize(dbName: string | undefined): Uint8Array;
  deserialize(bytes: Uint8Array, dbName: string | undefined): void;
  createSession(options: SessionOptions): Session;
  applyChangeset(bytes: Uint8Array): boolean;
  createTagStore(capacity: number): TagStore;
  enableLoadExtension(allow: boolean): void;
  enableDefensive(active: boolean): void;
  loadExtension(path: string, entryPoint: string | undefined): void;
  [Symbol.dispose](): void;
}

export interface Session extends Disposable {
  /**
   * This type does not have a public constructor.
   */

  changeset(): Uint8Array;
  patchset(): Uint8Array;
  close(): void;
  [Symbol.dispose](): void;
}

export interface Statement extends Disposable {
  /**
   * This type does not have a public constructor.
   */

  all(parameters: Bindings): Array<Row>;
  get(parameters: Bindings): Row | undefined;
  run(parameters: Bindings): Changes;
  iterate(parameters: Bindings): Cursor;
  columns(): Array<Column>;
  sourceSql(): string;
  expandedSql(): string;
  setReadBigInts(enabled: boolean): void;
  setReturnArrays(enabled: boolean): void;
  setAllowBareNamedParameters(enabled: boolean): void;
  setAllowUnknownNamedParameters(enabled: boolean): void;
  [Symbol.dispose](): void;
}

export interface TagStore extends Disposable {
  /**
   * This type does not have a public constructor.
   */

  all(parts: Array<string>, parameters: Array<Value>): Array<Row>;
  get(parts: Array<string>, parameters: Array<Value>): Row | undefined;
  run(parts: Array<string>, parameters: Array<Value>): Changes;
  iterate(parts: Array<string>, parameters: Array<Value>): Cursor;
  size(): number;
  capacity(): number;
  clear(): void;
  [Symbol.dispose](): void;
}
