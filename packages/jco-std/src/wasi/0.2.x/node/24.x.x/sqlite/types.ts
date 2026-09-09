import type * as Wit from "./wire.js";
import type { SQLInputValue, SQLOutputValue, ResultRow } from "./codec.js";
export type { SQLInputValue, SQLOutputValue, ResultRow } from "./codec.js";
export interface StatementOptions {
  readBigInts?: boolean;
  returnArrays?: boolean;
  allowBareNamedParameters?: boolean;
  allowUnknownNamedParameters?: boolean;
}
export interface DatabaseSyncOptions extends StatementOptions {
  open?: boolean;
  readOnly?: boolean;
  enableForeignKeyConstraints?: boolean;
  enableDoubleQuotedStringLiterals?: boolean;
  allowExtension?: boolean;
  timeout?: number;
  defensive?: boolean;
  limits?: Partial<Limits>;
}
export interface Limits {
  length: number;
  sqlLength: number;
  column: number;
  exprDepth: number;
  compoundSelect: number;
  vdbeOp: number;
  functionArg: number;
  attach: number;
  likePatternLength: number;
  variableNumber: number;
  triggerDepth: number;
}
export interface SessionOptions {
  table?: string;
  db?: string;
}
export interface BackupOptions {
  source?: string;
  target?: string;
  rate?: number;
  progress?: (info: { totalPages: number; remainingPages: number }) => void;
}
export interface ApplyChangesetOptions {
  filter?: (table: string) => boolean;
  onConflict?: (conflict: number) => number;
}
export interface FunctionOptions {
  deterministic?: boolean;
  directOnly?: boolean;
  useBigIntArguments?: boolean;
  varargs?: boolean;
}
export interface AggregateOptions<T extends SQLInputValue = SQLInputValue> extends FunctionOptions {
  start: T | (() => T);
  step: (accumulator: T, ...args: SQLOutputValue[]) => T;
  result?: (accumulator: T) => SQLInputValue;
  inverse?: (accumulator: T, ...args: SQLOutputValue[]) => T;
}
export interface Changes {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}
export interface Column {
  column: string | null;
  database: string | null;
  name: string;
  table: string | null;
  type: string | null;
}
export type Parameters = SQLInputValue[] | [Record<string, SQLInputValue>, ...SQLInputValue[]];
export interface StatementSync {
  readonly sourceSQL: string;
  readonly expandedSQL: string;
  all(...parameters: Parameters): ResultRow[];
  get(...parameters: Parameters): ResultRow | undefined;
  run(...parameters: Parameters): Changes;
  iterate(...parameters: Parameters): IterableIterator<ResultRow>;
  columns(): Column[];
  setReadBigInts(enabled: boolean): void;
  setReturnArrays(enabled: boolean): void;
  setAllowBareNamedParameters(enabled: boolean): void;
  setAllowUnknownNamedParameters(enabled: boolean): void;
}
export interface Session extends Disposable {
  changeset(): Uint8Array;
  patchset(): Uint8Array;
  close(): void;
}
export interface SQLTagStore {
  readonly capacity: number;
  readonly db: DatabaseSync;
  readonly size: number;
  all(template: TemplateStringsArray, ...values: SQLInputValue[]): ResultRow[];
  get(template: TemplateStringsArray, ...values: SQLInputValue[]): ResultRow | undefined;
  run(template: TemplateStringsArray, ...values: SQLInputValue[]): Changes;
  iterate(template: TemplateStringsArray, ...values: SQLInputValue[]): IterableIterator<ResultRow>;
  clear(): void;
}
export interface DatabaseSync extends Disposable {
  readonly isOpen: boolean;
  readonly isTransaction: boolean;
  readonly limits: Limits;
  open(): void;
  close(): void;
  exec(sql: string): void;
  prepare(sql: string, options?: StatementOptions): StatementSync;
  location(dbName?: string): string | null;
  serialize(dbName?: string): Uint8Array;
  deserialize(bytes: Uint8Array, options?: { dbName?: string }): void;
  createSession(options?: SessionOptions): Session;
  applyChangeset(bytes: Uint8Array, options?: ApplyChangesetOptions): boolean;
  createTagStore(maxSize?: number): SQLTagStore;
  enableLoadExtension(allow: boolean): void;
  enableDefensive(active: boolean): void;
  loadExtension(path: string, entryPoint?: string): void;
  function(name: string, fn: (...args: SQLOutputValue[]) => SQLInputValue): void;
  function(
    name: string,
    options: FunctionOptions,
    fn: (...args: SQLOutputValue[]) => SQLInputValue,
  ): void;
  aggregate<T extends SQLInputValue>(name: string, options: AggregateOptions<T>): void;
  setAuthorizer(
    callback:
      | ((
          action: number,
          arg1: string | null,
          arg2: string | null,
          db: string | null,
          trigger: string | null,
        ) => number)
      | null,
  ): void;
}
export interface SqliteModule {
  DatabaseSync: {
    new (path: string | Uint8Array | URL, options?: DatabaseSyncOptions): DatabaseSync;
    readonly prototype: DatabaseSync;
  };
  StatementSync: { readonly prototype: StatementSync };
  Session: { readonly prototype: Session };
  constants: Record<string, number>;
  backup(
    source: DatabaseSync,
    path: string | Uint8Array | URL,
    options?: BackupOptions,
  ): Promise<number>;
}
export interface SqliteHost {
  openDatabase(path: Wit.Path, options: Wit.DatabaseOptions): Wit.Database;
  backup(
    source: Wit.Database,
    path: Wit.Path,
    options: Wit.BackupOptions,
  ): number | Promise<number>;
}
