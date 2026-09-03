/**
 * Type shapes shared by every host-backed Node builtin's WIT boundary.
 *
 * Each `jco:node/*` interface returns `result<T, error>` and models errno the same way, so the
 * corresponding TypeScript is declared once here and each builtin's `types.ts` narrows it with
 * its own error fields. These aliases are structural: they must stay identical to the records the
 * WIT files declare, since transpiled bindings produce exactly these object shapes.
 */

/** A WIT `result<T, E>` as jco lowers it. */
export type HostResult<T, E> = { tag: "ok"; val: T } | { tag: "err"; val: E };

/** A WIT `variant errno { number(s64), symbolic(string) }`. */
export type HostErrno = { tag: "number"; val: bigint } | { tag: "symbolic"; val: string };

/** The fields every builtin's serialized host error record carries. */
export interface HostErrorBase {
  name: string;
  message: string;
  code?: string;
  errno?: HostErrno;
  syscall?: string;
}
