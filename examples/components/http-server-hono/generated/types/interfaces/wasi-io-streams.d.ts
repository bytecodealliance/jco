/// <reference path="./wasi-io-error.d.ts" />
/// <reference path="./wasi-io-poll.d.ts" />
declare module 'wasi:io/streams@0.2.3' {
  export type Error = import('wasi:io/error@0.2.3').Error;
  export type Pollable = import('wasi:io/poll@0.2.3').Pollable;
  export type StreamError = StreamErrorLastOperationFailed | StreamErrorClosed;
  export interface StreamErrorLastOperationFailed {
    tag: 'last-operation-failed',
    val: Error,
  }
  export interface StreamErrorClosed {
    tag: 'closed',
  }
  
  export class InputStream {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    read(len: bigint): Uint8Array;
    blockingRead(len: bigint): Uint8Array;
    skip(len: bigint): bigint;
    blockingSkip(len: bigint): bigint;
    subscribe(): Pollable;
  }
  
  export class OutputStream {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    checkWrite(): bigint;
    write(contents: Uint8Array): void;
    blockingWriteAndFlush(contents: Uint8Array): void;
    flush(): void;
    blockingFlush(): void;
    subscribe(): Pollable;
    writeZeroes(len: bigint): void;
    blockingWriteZeroesAndFlush(len: bigint): void;
    splice(src: InputStream, len: bigint): bigint;
    blockingSplice(src: InputStream, len: bigint): bigint;
  }
}
