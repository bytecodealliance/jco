/** @module Interface wasi:cli/stdin@0.3.0-rc-2026-02-09 **/
/**
 * Return a stream for reading from stdin.
 * 
 * This function returns a stream which provides data read from stdin,
 * and a future to signal read results.
 * 
 * If the stream's readable end is dropped the future will resolve to success.
 * 
 * If the stream's writable end is dropped the future will either resolve to
 * success if stdin was closed by the writer or to an error-code if reading
 * failed for some other reason.
 * 
 * Multiple streams may be active at the same time. The behavior of concurrent
 * reads is implementation-specific.
 */
export function readViaStream(): [ReadableStream<number>, Promise<Result<void, ErrorCode>>];
export type ErrorCode = import('./wasi-cli-types.js').ErrorCode;
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };
