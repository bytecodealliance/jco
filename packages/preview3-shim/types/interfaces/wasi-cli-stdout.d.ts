/** @module Interface wasi:cli/stdout@0.3.0-rc-2026-02-09 **/
/**
 * Write the given stream to stdout.
 * 
 * If the stream's writable end is dropped this function will either return
 * success once the entire contents of the stream have been written or an
 * error-code representing a failure.
 * 
 * Otherwise if there is an error the readable end of the stream will be
 * dropped and this function will return an error-code.
 */
export function writeViaStream(data: ReadableStream<number>): Promise<Result<void, ErrorCode>>;
export type ErrorCode = import('./wasi-cli-types.js').ErrorCode;
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };
