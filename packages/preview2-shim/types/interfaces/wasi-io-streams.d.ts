export namespace WasiIoStreams {
  /**
   * Perform a non-blocking read from the stream.
   * 
   * This function returns a list of bytes containing the data that was
   * read, along with a `stream-status` which, indicates whether further
   * reads are expected to produce data. The returned list will contain up to
   * `len` bytes; it may return fewer than requested, but not more. An
   * empty list and `stream-status:open` indicates no more data is
   * available at this time, and that the pollable given by
   * `subscribe-to-input-stream` will be ready when more data is available.
   * 
   * Once a stream has reached the end, subsequent calls to `read` or
   * `skip` will always report `stream-status:ended` rather than producing more
   * data.
   * 
   * When the caller gives a `len` of 0, it represents a request to read 0
   * bytes. This read should  always succeed and return an empty list and
   * the current `stream-status`.
   * 
   * The `len` parameter is a `u64`, which could represent a list of u8 which
   * is not possible to allocate in wasm32, or not desirable to allocate as
   * as a return value by the callee. The callee may return a list of bytes
   * less than `len` in size while more bytes are available for reading.
   */
  export function read(this_: InputStream, len: bigint): [Uint8Array, StreamStatus];
  /**
   * Read bytes from a stream, after blocking until at least one byte can
   * be read. Except for blocking, identical to `read`.
   */
  export function blockingRead(this_: InputStream, len: bigint): [Uint8Array, StreamStatus];
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
   * This function returns the number of bytes skipped, along with a
   * `stream-status` indicating whether the end of the stream was
   * reached. The returned value will be at most `len`; it may be less.
   */
  export function skip(this_: InputStream, len: bigint): [bigint, StreamStatus];
  /**
   * Skip bytes from a stream, after blocking until at least one byte
   * can be skipped. Except for blocking behavior, identical to `skip`.
   */
  export function blockingSkip(this_: InputStream, len: bigint): [bigint, StreamStatus];
  /**
   * Create a `pollable` which will resolve once either the specified stream
   * has bytes available to read or the other end of the stream has been
   * closed.
   * The created `pollable` is a child resource of the `input-stream`.
   * Implementations may trap if the `input-stream` is dropped before
   * all derived `pollable`s created with this function are dropped.
   */
  export function subscribeToInputStream(this_: InputStream): Pollable;
  /**
   * Dispose of the specified `input-stream`, after which it may no longer
   * be used.
   * Implementations may trap if this `input-stream` is dropped while child
   * `pollable` resources are still alive.
   * After this `input-stream` is dropped, implementations may report any
   * corresponding `output-stream` has `stream-state.closed`.
   */
  export function dropInputStream(this_: InputStream): void;
  /**
   * Check readiness for writing. This function never blocks.
   * 
   * Returns the number of bytes permitted for the next call to `write`,
   * or an error. Calling `write` with more bytes than this function has
   * permitted will trap.
   * 
   * When this function returns 0 bytes, the `subscribe-to-output-stream`
   * pollable will become ready when this function will report at least
   * 1 byte, or an error.
   */
  export function checkWrite(this_: OutputStream): bigint;
  /**
   * Perform a write. This function never blocks.
   * 
   * Precondition: check-write gave permit of Ok(n) and contents has a
   * length of less than or equal to n. Otherwise, this function will trap.
   * 
   * returns Err(closed) without writing if the stream has closed since
   * the last call to check-write provided a permit.
   */
  export function write(this_: OutputStream, contents: Uint8Array): void;
  /**
   * Perform a write of up to 4096 bytes, and then flush the stream. Block
   * until all of these operations are complete, or an error occurs.
   * 
   * This is a convenience wrapper around the use of `check-write`,
   * `subscribe-to-output-stream`, `write`, and `flush`, and is implemented
   * with the following pseudo-code:
   * 
   * ```text
   * let pollable = subscribe-to-output-stream(this);
   * while !contents.is_empty() {
     * // Wait for the stream to become writable
     * poll-oneoff(pollable);
     * let Ok(n) = check-write(this); // eliding error handling
     * let len = min(n, contents.len());
     * let (chunk, rest) = contents.split_at(len);
     * write(this, chunk);            // eliding error handling
     * contents = rest;
     * }
     * flush(this);
     * // Wait for completion of `flush`
     * poll-oneoff(pollable);
     * // Check for any errors that arose during `flush`
     * let _ = check-write(this);       // eliding error handling
     * ```
     */
    export function blockingWriteAndFlush(this_: OutputStream, contents: Uint8Array): void;
    /**
     * Request to flush buffered output. This function never blocks.
     * 
     * This tells the output-stream that the caller intends any buffered
     * output to be flushed. the output which is expected to be flushed
     * is all that has been passed to `write` prior to this call.
     * 
     * Upon calling this function, the `output-stream` will not accept any
     * writes (`check-write` will return `ok(0)`) until the flush has
     * completed. The `subscribe-to-output-stream` pollable will become ready
     * when the flush has completed and the stream can accept more writes.
     */
    export function flush(this_: OutputStream): void;
    /**
     * Request to flush buffered output, and block until flush completes
     * and stream is ready for writing again.
     */
    export function blockingFlush(this_: OutputStream): void;
    /**
     * Create a `pollable` which will resolve once the output-stream
     * is ready for more writing, or an error has occured. When this
     * pollable is ready, `check-write` will return `ok(n)` with n>0, or an
     * error.
     * 
     * If the stream is closed, this pollable is always ready immediately.
     * 
     * The created `pollable` is a child resource of the `output-stream`.
     * Implementations may trap if the `output-stream` is dropped before
     * all derived `pollable`s created with this function are dropped.
     */
    export function subscribeToOutputStream(this_: OutputStream): Pollable;
    /**
     * Write zeroes to a stream.
     * 
     * this should be used precisely like `write` with the exact same
     * preconditions (must use check-write first), but instead of
     * passing a list of bytes, you simply pass the number of zero-bytes
     * that should be written.
     */
    export function writeZeroes(this_: OutputStream, len: bigint): void;
    /**
     * Read from one stream and write to another.
     * 
     * This function returns the number of bytes transferred; it may be less
     * than `len`.
     * 
     * Unlike other I/O functions, this function blocks until all the data
     * read from the input stream has been written to the output stream.
     */
    export function splice(this_: OutputStream, src: InputStream, len: bigint): [bigint, StreamStatus];
    /**
     * Read from one stream and write to another, with blocking.
     * 
     * This is similar to `splice`, except that it blocks until at least
     * one byte can be read.
     */
    export function blockingSplice(this_: OutputStream, src: InputStream, len: bigint): [bigint, StreamStatus];
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
    export function forward(this_: OutputStream, src: InputStream): [bigint, StreamStatus];
    /**
     * Dispose of the specified `output-stream`, after which it may no longer
     * be used.
     * Implementations may trap if this `output-stream` is dropped while
     * child `pollable` resources are still alive.
     * After this `output-stream` is dropped, implementations may report any
     * corresponding `input-stream` has `stream-state.closed`.
     */
    export function dropOutputStream(this_: OutputStream): void;
  }
  import type { Pollable } from '../interfaces/wasi-poll-poll';
  export { Pollable };
  /**
   * Streams provide a sequence of data and then end; once they end, they
   * no longer provide any further data.
   * 
   * For example, a stream reading from a file ends when the stream reaches
   * the end of the file. For another example, a stream reading from a
   * socket ends when the socket is closed.
   * # Variants
   * 
   * ## `"open"`
   * 
   * The stream is open and may produce further data.
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
   * `input-stream`s are *non-blocking* to the extent practical on underlying
   * platforms. I/O operations always return promptly; if fewer bytes are
   * promptly available than requested, they return the number of bytes promptly
   * available, which could even be zero. To wait for data to be available,
   * use the `subscribe-to-input-stream` function to obtain a `pollable` which
   * can be polled for using `wasi:poll/poll.poll_oneoff`.
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
  /**
   * An error for output-stream operations.
   * 
   * Contrary to input-streams, a closed output-stream is reported using
   * an error.
   * # Variants
   * 
   * ## `"last-operation-failed"`
   * 
   * The last operation (a write or flush) failed before completion.
   * ## `"closed"`
   * 
   * The stream is closed: no more input will be accepted by the
   * stream. A closed output-stream will return this error on all
   * future operations.
   */
  export type WriteError = 'last-operation-failed' | 'closed';
  