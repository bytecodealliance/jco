/**
 * The WASI preview1 syscalls Node's `wasi` binding exposes on `wasiImport`, each with the
 * parameter types its native implementation declares, from nodejs/node v24.19.0
 * src/node_wasi.h (commit cdc1b38d40cb567b7ad0b39c86addf830a0af0ae). Both snapshots Node
 * accepts, `unstable` and `preview1`, bind this same table. The parameter list also fixes each
 * function's reported arity.
 */

/** A native parameter type: `u32` must be a JavaScript number V8 reports as `IsUint32`, the 64-bit kinds a BigInt. */
export type SyscallParameter = "u32" | "u64" | "i64";

export const PREVIEW1_SYSCALLS = [
  ["args_get", ["u32", "u32"]],
  ["args_sizes_get", ["u32", "u32"]],
  ["clock_res_get", ["u32", "u32"]],
  ["clock_time_get", ["u32", "u64", "u32"]],
  ["environ_get", ["u32", "u32"]],
  ["environ_sizes_get", ["u32", "u32"]],
  ["fd_advise", ["u32", "u64", "u64", "u32"]],
  ["fd_allocate", ["u32", "u64", "u64"]],
  ["fd_close", ["u32"]],
  ["fd_datasync", ["u32"]],
  ["fd_fdstat_get", ["u32", "u32"]],
  ["fd_fdstat_set_flags", ["u32", "u32"]],
  ["fd_fdstat_set_rights", ["u32", "u64", "u64"]],
  ["fd_filestat_get", ["u32", "u32"]],
  ["fd_filestat_set_size", ["u32", "u64"]],
  ["fd_filestat_set_times", ["u32", "u64", "u64", "u32"]],
  ["fd_pread", ["u32", "u32", "u32", "u64", "u32"]],
  ["fd_prestat_get", ["u32", "u32"]],
  ["fd_prestat_dir_name", ["u32", "u32", "u32"]],
  ["fd_pwrite", ["u32", "u32", "u32", "u64", "u32"]],
  ["fd_read", ["u32", "u32", "u32", "u32"]],
  ["fd_readdir", ["u32", "u32", "u32", "u64", "u32"]],
  ["fd_renumber", ["u32", "u32"]],
  ["fd_seek", ["u32", "i64", "u32", "u32"]],
  ["fd_sync", ["u32"]],
  ["fd_tell", ["u32", "u32"]],
  ["fd_write", ["u32", "u32", "u32", "u32"]],
  ["path_create_directory", ["u32", "u32", "u32"]],
  ["path_filestat_get", ["u32", "u32", "u32", "u32", "u32"]],
  ["path_filestat_set_times", ["u32", "u32", "u32", "u32", "u64", "u64", "u32"]],
  ["path_link", ["u32", "u32", "u32", "u32", "u32", "u32", "u32"]],
  ["path_open", ["u32", "u32", "u32", "u32", "u32", "u64", "u64", "u32", "u32"]],
  ["path_readlink", ["u32", "u32", "u32", "u32", "u32", "u32"]],
  ["path_remove_directory", ["u32", "u32", "u32"]],
  ["path_rename", ["u32", "u32", "u32", "u32", "u32", "u32"]],
  ["path_symlink", ["u32", "u32", "u32", "u32", "u32"]],
  ["path_unlink_file", ["u32", "u32", "u32"]],
  ["poll_oneoff", ["u32", "u32", "u32", "u32"]],
  ["proc_exit", ["u32"]],
  ["proc_raise", ["u32"]],
  ["random_get", ["u32", "u32"]],
  ["sched_yield", []],
  ["sock_accept", ["u32", "u32", "u32"]],
  ["sock_recv", ["u32", "u32", "u32", "u32", "u32", "u32"]],
  ["sock_send", ["u32", "u32", "u32", "u32", "u32"]],
  ["sock_shutdown", ["u32", "u32"]],
] as const satisfies ReadonlyArray<readonly [string, readonly SyscallParameter[]]>;

export type Preview1Syscall = (typeof PREVIEW1_SYSCALLS)[number][0];
