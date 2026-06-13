/** @module Interface wasi:cli/exit@0.3.0 **/
/**
 * Exit the current instance and any linked instances.
 */
export function exit(status: Result<void, void>): void;
/**
 * Exit the current instance and any linked instances, reporting the
 * specified status code to the host.
 * 
 * The meaning of the code depends on the context, with 0 usually meaning
 * "success", and other values indicating various types of failure.
 * 
 * This function does not return; the effect is analogous to a trap, but
 * without the connotation that something bad has happened.
 */
export function exitWithCode(statusCode: number): void;
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };
