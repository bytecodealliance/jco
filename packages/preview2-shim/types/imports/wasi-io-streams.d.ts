export namespace WasiIoStreams {
  /**
   * Perform a non-blocking read from the stream.
   * 
   * This function returns a list of bytes containing the data that was
   * read, along with a `stream-status` which, indicates whether further
   * reads are expected to produce data. The returned list will contain up to
   * `len` bytes; it may return fewer than requested, but not more.
   * 
   * Once a stream has reached the end, subsequent calls to read or
   * `skip` will always report end-of-stream rather than producing more
   * data.
   * 
   * If `len` is 0, it represents a request to read 0 bytes, which should
   * always succeed, assuming the stream hasn't reached its end yet, and
   * return an empty list.
   * 
   * The len here is a `u64`, but some callees may not be able to allocate
   * a buffer as large as that would imply.
   * FIXME: describe what happens if allocation fails.
   * 
   * When the returned `stream-status` is `open`, the length of the returned
   * value may be less than `len`. When an empty list is returned, this
   * indicates that no more bytes were available from the stream at that
   * time. In that case the subscribe-to-input-stream pollable will indicate
   * when additional bytes are available for reading.
   */
  export function read(this: InputStream, len: bigint): [Uint8Array | ArrayBuffer, StreamStatus];
  /**
   * Read bytes from a stream, with blocking.
   * 
   * This is similar to `read`, except that it blocks until at least one
   * byte can be read.
   */
  export function blockingRead(this: InputStream, len: bigint): [Uint8Array | ArrayBuffer, StreamStatus];
  /**
   * Skip bytes from a stream.
   * 
   * This is similar to the `read` function, but avoids copying the
   * bytes into the instance.
   * 
   * Once a stream has reached the end, subsequent calls to read or
   * `skip` will always report end-of-stream rather than producing more
   * data.
   * 
   * This function returns the number of bytes skipped, along with a bool
   * indicating whether the end of the stream was reached. The returned
   * value will be at most `len`; it may be less.
   */
  export function skip(this: InputStream, len: bigint): [bigint, StreamStatus];
  /**
   * Skip bytes from a stream, with blocking.
   * 
   * This is similar to `skip`, except that it blocks until at least one
   * byte can be consumed.
   */
  export function blockingSkip(this: InputStream, len: bigint): [bigint, StreamStatus];
  /**
   * Create a `pollable` which will resolve once either the specified stream
   * has bytes available to read or the other end of the stream has been
   * closed.
   */
  export function subscribeToInputStream(this: InputStream): Pollable;
  /**
   * Dispose of the specified `input-stream`, after which it may no longer
   * be used.
   */
  export function dropInputStream(this: InputStream): void;
  /**
   * Perform a non-blocking write of bytes to a stream.
   * 
   * This function returns a `u64` and a `stream-status`. The `u64` indicates
   * the number of bytes from `buf` that were written, which may be less than
   * the length of `buf`. The `stream-status` indicates if further writes to
   * the stream are expected to be read.
   * 
   * When the returned `stream-status` is `open`, the `u64` return value may
   * be less than the length of `buf`. This indicates that no more bytes may
   * be written to the stream promptly. In that case the
   * subscribe-to-output-stream pollable will indicate when additional bytes
   * may be promptly written.
   * 
   * TODO: document what happens when an empty list is written
   */
  export function write(this: OutputStream, buf: Uint8Array): [bigint, StreamStatus];
  /**
   * Write bytes to a stream, with blocking.
   * 
   * This is similar to `write`, except that it blocks until at least one
   * byte can be written.
   */
  export function blockingWrite(this: OutputStream, buf: Uint8Array): [bigint, StreamStatus];
  /**
   * Write multiple zero bytes to a stream.
   * 
   * This function returns a `u64` indicating the number of zero bytes
   * that were written; it may be less than `len`.
   */
  export function writeZeroes(this: OutputStream, len: bigint): [bigint, StreamStatus];
  /**
   * Write multiple zero bytes to a stream, with blocking.
   * 
   * This is similar to `write-zeroes`, except that it blocks until at least
   * one byte can be written.
   */
  export function blockingWriteZeroes(this: OutputStream, len: bigint): [bigint, StreamStatus];
  /**
   * Read from one stream and write to another.
   * 
   * This function returns the number of bytes transferred; it may be less
   * than `len`.
   * 
   * Unlike other I/O functions, this function blocks until all the data
   * read from the input stream has been written to the output stream.
   */
  export function splice(this: OutputStream, src: InputStream, len: bigint): [bigint, StreamStatus];
  /**
   * Read from one stream and write to another, with blocking.
   * 
   * This is similar to `splice`, except that it blocks until at least
   * one byte can be read.
   */
  export function blockingSplice(this: OutputStream, src: InputStream, len: bigint): [bigint, StreamStatus];
  /**
   * Forward the entire contents of an input stream to an output stream.
   * 
   * This function repeatedly reads from the input stream and writes
   * the data to the output stream, until the end of the input stream
   * is reached, or an error is encountered.
   * 
   * Unlike other I/O functions, this function blocks until the end
   * of the input stream is seen and all the data has been written to
   * the output stream.
   * 
   * This function returns the number of bytes transferred, and the status of
   * the output stream.
   */
  export function forward(this: OutputStream, src: InputStream): [bigint, StreamStatus];
  /**
   * Create a `pollable` which will resolve once either the specified stream
   * is ready to accept bytes or the other end of the stream has been closed.
   */
  export function subscribeToOutputStream(this: OutputStream): Pollable;
  /**
   * Dispose of the specified `output-stream`, after which it may no longer
   * be used.
   */
  export function dropOutputStream(this: OutputStream): void;
}
import type { Pollable } from '../imports/wasi-poll-poll';
export { Pollable };
/**
 * An error type returned from a stream operation.
 * 
 * TODO: need to figure out the actual contents of this error. Used to be
 * an empty record but that's no longer allowed. The `dummy` field is
 * only here to have this be a valid in the component model by being
 * non-empty.
 */
export interface StreamError {
  dummy: number,
}
/**
 * Streams provide a sequence of data and then end; once they end, they
 * no longer provide any further data.
 * 
 * For example, a stream reading from a file ends when the stream reaches
 * the end of the file. For another example, a stream reading from a
 * socket ends when the socket is closed.
 * 
 * # Variants
 * 
 * ## `"open"`
 * 
 * The stream is open and may produce further data.
 * 
 * ## `"ended"`
 * 
 * When reading, this indicates that the stream will not produce
 * further data.
 * When writing, this indicates that the stream will no longer be read.
 * Further writes are still permitted.
 */
export type StreamStatus = 'open' | 'ended';
/**
 * An input bytestream. In the future, this will be replaced by handle
 * types.
 * 
 * This conceptually represents a `stream<u8, _>`. It's temporary
 * scaffolding until component-model's async features are ready.
 * 
 * `input-stream`s are *non-blocking* to the extent practical on underlying
 * platforms. I/O operations always return promptly; if fewer bytes are
 * promptly available than requested, they return the number of bytes promptly
 * available, which could even be zero. To wait for data to be available,
 * use the `subscribe-to-input-stream` function to obtain a `pollable` which
 * can be polled for using `wasi_poll`.
 * 
 * And at present, it is a `u32` instead of being an actual handle, until
 * the wit-bindgen implementation of handles and resources is ready.
 * 
 * This [represents a resource](https://github.com/WebAssembly/WASI/blob/main/docs/WitInWasi.md#Resources).
 */
export type InputStream = number;
/**
 * An output bytestream. In the future, this will be replaced by handle
 * types.
 * 
 * This conceptually represents a `stream<u8, _>`. It's temporary
 * scaffolding until component-model's async features are ready.
 * 
 * `output-stream`s are *non-blocking* to the extent practical on
 * underlying platforms. Except where specified otherwise, I/O operations also
 * always return promptly, after the number of bytes that can be written
 * promptly, which could even be zero. To wait for the stream to be ready to
 * accept data, the `subscribe-to-output-stream` function to obtain a
 * `pollable` which can be polled for using `wasi:poll`.
 * 
 * And at present, it is a `u32` instead of being an actual handle, until
 * the wit-bindgen implementation of handles and resources is ready.
 * 
 * This [represents a resource](https://github.com/WebAssembly/WASI/blob/main/docs/WitInWasi.md#Resources).
 */
export type OutputStream = number;
