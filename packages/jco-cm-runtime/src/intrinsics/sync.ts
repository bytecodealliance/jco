/**
 * Checked adapters for a single synchronous guest instance. The generator only
 * selects these operations when no async lift, task-local intrinsic, or
 * cross-instance resource transfer can observe an import as a separate task.
 * Both the embedded linker and external bindings import this same entry point.
 */
export { lowerSyncImport } from './async-task/lower-import-backwards-compat.js';
export { guardSyncRealloc } from './async-task/sync-realloc.js';
export { tableRep } from './resource-entry.js';
export { IndexedResourceCaptures } from './resource-captures.js';
export { encodeSyncUtf8 } from './sync-utf8.js';
// A synchronous string lift only needs the decoder. Importing the general lift
// module in a browser also loads its stream, future and error-context adapters.
export { decodeUtf8 as decodeSyncUtf8 } from './decode-utf8.js';
