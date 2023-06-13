export namespace CliBaseExit {
  export function /**
   * Exit the curerent instance and any linked instances.
   */
  exit(status: Result<void, void>): void;
}
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };
