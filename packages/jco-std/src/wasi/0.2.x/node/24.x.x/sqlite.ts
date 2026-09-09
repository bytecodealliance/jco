import { openDatabase, backup as hostBackup } from "jco:node/sqlite@0.1.0";
import { createSqlite } from "./sqlite/core.js";
import type * as Types from "./sqlite/types.js";
const sqlite = createSqlite({ openDatabase, backup: hostBackup });
export const { DatabaseSync, StatementSync, Session, constants, backup } = sqlite;
export type DatabaseSync = Types.DatabaseSync;
export type StatementSync = Types.StatementSync;
export type Session = Types.Session;
export type {
  DatabaseSyncOptions,
  StatementOptions,
  SQLInputValue,
  SQLOutputValue,
  SQLTagStore,
  BackupOptions,
  ApplyChangesetOptions,
  FunctionOptions,
  AggregateOptions,
} from "./sqlite/types.js";
export default sqlite;
