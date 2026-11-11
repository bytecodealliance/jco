/// <reference path="./wasi-io-error.d.ts" />
/// <reference path="./wasi-io-poll.d.ts" />
declare module 'wasi:io/streams@0.2.12' {
  export type Error = import('wasi:io/error@0.2.12').Error;
  export type Pollable = import('wasi:io/poll@0.2.12').Pollable;
  export type StreamError = StreamErrorLastOperationFailed | StreamErrorClosed;
  export interface StreamErrorLastOperationFailed {
    tag: 'last-operation-failed',
    val: Error,
  }
  export interface StreamErrorClosed {
    tag: 'closed',
  }

  export class InputStream implements Disposable {
    /**
     * Identifies the resource to the type checker. This member does not exist at runtime.
     */
    readonly $brand: 'wasi:io/streams@0.2#input-stream';
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    read(len: bigint): Uint8Array;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    blockingRead(len: bigint): Uint8Array;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    skip(len: bigint): bigint;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    blockingSkip(len: bigint): bigint;
    subscribe(): Pollable;
    [Symbol.dispose](): void;
  }

  export class OutputStream implements Disposable {
    /**
     * Identifies the resource to the type checker. This member does not exist at runtime.
     */
    readonly $brand: 'wasi:io/streams@0.2#output-stream';
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    checkWrite(): bigint;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    write(contents: Uint8Array): void;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    blockingWriteAndFlush(contents: Uint8Array): void;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    flush(): void;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    blockingFlush(): void;
    subscribe(): Pollable;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    writeZeroes(len: bigint): void;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    blockingWriteZeroesAndFlush(len: bigint): void;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    splice(src: InputStream, len: bigint): bigint;
    /**
    * @throws {globalThis.Error & { payload: StreamError }} The error of the result, as the `payload` of the thrown error.
    */
    blockingSplice(src: InputStream, len: bigint): bigint;
    [Symbol.dispose](): void;
  }
}
