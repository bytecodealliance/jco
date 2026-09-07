/// <reference path="./wasi-io-error.d.ts" />
/// <reference path="./wasi-io-poll.d.ts" />
/// <reference path="./wasi-io-streams.d.ts" />
declare module 'wasi:tls/types@0.2.0-draft' {
  export type InputStream = import('wasi:io/streams@0.2.6').InputStream;
  export type OutputStream = import('wasi:io/streams@0.2.6').OutputStream;
  export type Pollable = import('wasi:io/poll@0.2.6').Pollable;
  export type IoError = import('wasi:io/error@0.2.6').Error;
  export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };

  export class ClientConnection implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    closeOutput(): void;
    [Symbol.dispose](): void;
  }

  export class ClientHandshake implements Disposable {
    constructor(serverName: string, input: InputStream, output: OutputStream)
    static finish(this_: ClientHandshake): FutureClientStreams;
    [Symbol.dispose](): void;
  }

  export class FutureClientStreams implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    subscribe(): Pollable;
    get(): Result<Result<[ClientConnection, InputStream, OutputStream], IoError>, void> | undefined;
    [Symbol.dispose](): void;
  }
}
