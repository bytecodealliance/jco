import type { Path, DatabaseOptions, Database, BackupOptions } from "./sqlite/wire.js";
export function openDatabase(path: Path, options: DatabaseOptions): Database;
export function backup(source: Database, path: Path, options: BackupOptions): number;
export type * from "./sqlite/wire.js";
