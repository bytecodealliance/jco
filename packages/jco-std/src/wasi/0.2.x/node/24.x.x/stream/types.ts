/**
 * Portable classic stream contracts, reconciled with @types/node 24 and
 * nodejs/node v24.20.0 (71b8b174857e25106d39b61a9e6f30d927da8b01),
 * doc/api/stream.md (MIT). Local types use generic chunks and Web platform
 * types so emitted declarations do not require Node's ambient declarations.
 */
export type Callback = (error?: Error | null) => void;
export type Listener = (...args: unknown[]) => void;
export interface Stream {
  on<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  once<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  off<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  addListener<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  removeListener<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  removeAllListeners(event?: string | symbol): this;
  prependListener<T extends unknown[]>(
    event: string | symbol,
    listener: (...args: T) => void,
  ): this;
  prependOnceListener<T extends unknown[]>(
    event: string | symbol,
    listener: (...args: T) => void,
  ): this;
  emit(event: string | symbol, ...args: unknown[]): boolean;
  eventNames(): Array<string | symbol>;
  listeners(event: string | symbol): Listener[];
  rawListeners(event: string | symbol): Listener[];
  listenerCount(event: string | symbol, listener?: Listener): number;
  getMaxListeners(): number;
  setMaxListeners(count: number): this;
  pipe<T extends Writable>(destination: T, options?: { end?: boolean }): T;
}
export interface Destroyable extends Stream, AsyncDisposable {
  destroyed: boolean;
  readonly closed: boolean;
  readonly errored: Error | null;
  destroy(error?: Error): this;
  _destroy(error: Error | null, callback: Callback): void;
}
export interface StreamOptions {
  highWaterMark?: number;
  objectMode?: boolean;
  emitClose?: boolean;
  autoDestroy?: boolean;
  signal?: AbortSignal;
  construct?(this: Destroyable, callback: Callback): void;
  destroy?(this: Destroyable, error: Error | null, callback: Callback): void;
}
export interface ReadableOptions extends StreamOptions {
  encoding?: string;
  read?(this: Readable, size: number): void;
}
export interface WritableOptions extends StreamOptions {
  decodeStrings?: boolean;
  defaultEncoding?: string;
  write?(this: Writable, chunk: unknown, encoding: string, callback: Callback): void;
  writev?(
    this: Writable,
    chunks: Array<{ chunk: unknown; encoding: string }>,
    callback: Callback,
  ): void;
  final?(this: Writable, callback: Callback): void;
}
export interface DuplexOptions extends ReadableOptions, WritableOptions {
  allowHalfOpen?: boolean;
  readableObjectMode?: boolean;
  writableObjectMode?: boolean;
  readableHighWaterMark?: number;
  writableHighWaterMark?: number;
  readable?: boolean;
  writable?: boolean;
}
export type TransformCallback = (error?: Error | null, data?: unknown) => void;
export interface TransformOptions extends DuplexOptions {
  transform?(this: Transform, chunk: unknown, encoding: string, callback: TransformCallback): void;
  flush?(this: Transform, callback: TransformCallback): void;
}
export interface IteratorOptions {
  destroyOnReturn?: boolean;
}
export interface OperatorOptions {
  signal?: AbortSignal;
  concurrency?: number;
  highWaterMark?: number;
}
export interface Readable<T = unknown> extends Destroyable, AsyncIterable<T> {
  readonly readable: boolean;
  readonly readableAborted: boolean;
  readonly readableDidRead: boolean;
  readonly readableEncoding: string | null;
  readonly readableEnded: boolean;
  readonly readableHighWaterMark: number;
  readonly readableLength: number;
  readonly readableObjectMode: boolean;
  readableFlowing: boolean | null;
  read(size?: number): T | null;
  _read(size: number): void;
  push(chunk: unknown, encoding?: string): boolean;
  unshift(chunk: unknown, encoding?: string): void;
  setEncoding(encoding: string): this;
  pause(): this;
  resume(): this;
  isPaused(): boolean;
  unpipe(destination?: Writable): this;
  wrap(stream: Stream): this;
  iterator(options?: IteratorOptions): AsyncIterableIterator<T>;
  [Symbol.asyncIterator](): AsyncIterableIterator<T>;
  compose<U>(
    stream: PipelineTransform<T, U> | Readable<U>,
    options?: { signal?: AbortSignal },
  ): Readable<U>;
  map<U>(
    fn: (chunk: T, options: { signal: AbortSignal }) => U | PromiseLike<U>,
    options?: OperatorOptions,
  ): Readable<Awaited<U>>;
  filter(
    fn: (chunk: T, options: { signal: AbortSignal }) => unknown,
    options?: OperatorOptions,
  ): Readable<T>;
  forEach(
    fn: (chunk: T, options: { signal: AbortSignal }) => unknown,
    options?: OperatorOptions,
  ): Promise<void>;
  toArray(options?: { signal?: AbortSignal }): Promise<T[]>;
  some(
    fn: (chunk: T, options: { signal: AbortSignal }) => unknown,
    options?: OperatorOptions,
  ): Promise<boolean>;
  find(
    fn: (chunk: T, options: { signal: AbortSignal }) => unknown,
    options?: OperatorOptions,
  ): Promise<T | undefined>;
  every(
    fn: (chunk: T, options: { signal: AbortSignal }) => unknown,
    options?: OperatorOptions,
  ): Promise<boolean>;
  flatMap<U>(
    fn: (
      chunk: T,
      options: { signal: AbortSignal },
    ) => Iterable<U> | AsyncIterable<U> | PromiseLike<Iterable<U> | AsyncIterable<U>>,
    options?: OperatorOptions,
  ): Readable<U>;
  drop(limit: number, options?: { signal?: AbortSignal }): Readable<T>;
  take(limit: number, options?: { signal?: AbortSignal }): Readable<T>;
  reduce(
    fn: (previous: T, chunk: T, options: { signal: AbortSignal }) => T | PromiseLike<T>,
    initial?: T,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
  reduce<U>(
    fn: (previous: U, chunk: T, options: { signal: AbortSignal }) => U | PromiseLike<U>,
    initial: U,
    options?: { signal?: AbortSignal },
  ): Promise<U>;
}
export interface Writable extends Destroyable {
  readonly writable: boolean;
  readonly writableAborted: boolean;
  readonly writableEnded: boolean;
  readonly writableFinished: boolean;
  readonly writableHighWaterMark: number;
  readonly writableLength: number;
  readonly writableNeedDrain: boolean;
  readonly writableObjectMode: boolean;
  readonly writableCorked: number;
  write(chunk: unknown, callback?: Callback): boolean;
  write(chunk: unknown, encoding?: string, callback?: Callback): boolean;
  end(callback?: Callback): this;
  end(chunk: unknown, callback?: Callback): this;
  end(chunk: unknown, encoding?: string, callback?: Callback): this;
  cork(): void;
  uncork(): void;
  setDefaultEncoding(encoding: string): this;
  _write(chunk: unknown, encoding: string, callback: Callback): void;
  _writev?(chunks: Array<{ chunk: unknown; encoding: string }>, callback: Callback): void;
  _final?(callback: Callback): void;
}
export interface Duplex<T = unknown> extends Readable<T>, Writable {
  allowHalfOpen: boolean;
}
export interface Transform<T = unknown> extends Duplex<T> {
  _transform(chunk: unknown, encoding: string, callback: TransformCallback): void;
  _flush?(callback: TransformCallback): void;
}
export interface ReadableConstructor {
  new <T = unknown>(options?: ReadableOptions): Readable<T>;
  (options?: ReadableOptions): Readable;
  prototype: Readable;
  from<T>(source: Iterable<T> | AsyncIterable<T>, options?: ReadableOptions): Readable<Awaited<T>>;
  fromWeb<T>(source: ReadableStream<T>, options?: ReadableOptions): Readable<T>;
  toWeb<T>(
    source: Readable<T>,
    options?: { strategy?: QueuingStrategy<T>; type?: "bytes" },
  ): ReadableStream<T>;
  isDisturbed(source: unknown): boolean;
  wrap(source: Stream, options?: ReadableOptions): Readable;
}
export interface WritableConstructor {
  new (options?: WritableOptions): Writable;
  (options?: WritableOptions): Writable;
  prototype: Writable;
  fromWeb(destination: WritableStream, options?: WritableOptions): Writable;
  toWeb(destination: Writable): WritableStream;
}
export interface DuplexConstructor {
  new <T = unknown>(options?: DuplexOptions): Duplex<T>;
  (options?: DuplexOptions): Duplex;
  prototype: Duplex;
  from(source: unknown): Duplex;
  fromWeb(pair: ReadableWritablePair, options?: DuplexOptions): Duplex;
  toWeb(source: Duplex, options?: { readableType?: "bytes" }): ReadableWritablePair;
}
export interface TransformConstructor {
  new <T = unknown>(options?: TransformOptions): Transform<T>;
  (options?: TransformOptions): Transform;
  prototype: Transform;
}
export interface FinishedOptions {
  error?: boolean;
  readable?: boolean;
  writable?: boolean;
  signal?: AbortSignal;
  cleanup?: boolean;
}
export interface Finished {
  (stream: Stream | ReadableStream | WritableStream, callback: Callback): () => void;
  (
    stream: Stream | ReadableStream | WritableStream,
    options: FinishedOptions,
    callback: Callback,
  ): () => void;
}
export interface PipelineOptions {
  signal?: AbortSignal;
  end?: boolean;
}
export type PipelineTransform<T = unknown, U = unknown> = (
  source: AsyncIterable<T>,
  options: { signal: AbortSignal },
) => AsyncIterable<U>;
export type PipelineSource<T> =
  | Iterable<T>
  | AsyncIterable<T>
  | ReadableStream<T>
  | ((options: { signal: AbortSignal }) => Iterable<T> | AsyncIterable<T>);
export type PipelineDestination<T, R> = (
  source: AsyncIterable<T>,
  options: { signal: AbortSignal },
) => Promise<R>;
export type PipelineStage =
  | Stream
  | Iterable<unknown>
  | AsyncIterable<unknown>
  | ReadableStream
  | WritableStream
  | ReadableWritablePair
  | PipelineTransform
  | ((options: { signal: AbortSignal }) => Iterable<unknown> | AsyncIterable<unknown>)
  | ((source: AsyncIterable<unknown>, options: { signal: AbortSignal }) => Promise<unknown>);
export interface Pipeline {
  <T, D extends Writable | WritableStream<T>>(
    source: PipelineSource<T>,
    destination: D,
    callback: Callback,
  ): D;
  <T, U, D extends Writable | WritableStream<U>>(
    source: PipelineSource<T>,
    transform: PipelineTransform<T, U>,
    destination: D,
    callback: Callback,
  ): D;
  <T, R>(
    source: PipelineSource<T>,
    destination: PipelineDestination<T, R>,
    callback: (error: Error | null, value?: R) => void,
  ): Stream;
  (
    streams: readonly PipelineStage[],
    callback: (error: Error | null, value?: unknown) => void,
  ): Stream;
  (...streams: [...PipelineStage[], (error: Error | null, value?: unknown) => void]): Stream;
}
export interface StreamPromises {
  finished(
    stream: Stream | ReadableStream | WritableStream,
    options?: FinishedOptions,
  ): Promise<void>;
  pipeline<T>(
    source: PipelineSource<T>,
    destination: Writable | WritableStream<T>,
    options?: PipelineOptions,
  ): Promise<void>;
  pipeline<T, R>(
    source: PipelineSource<T>,
    destination: PipelineDestination<T, R>,
    options?: PipelineOptions,
  ): Promise<R>;
  pipeline<T, U>(
    source: PipelineSource<T>,
    transform: PipelineTransform<T, U>,
    destination: Writable | WritableStream<U>,
    options?: PipelineOptions,
  ): Promise<void>;
  pipeline<T, U, R>(
    source: PipelineSource<T>,
    transform: PipelineTransform<T, U>,
    destination: PipelineDestination<U, R>,
    options?: PipelineOptions,
  ): Promise<R>;
  pipeline(streams: readonly PipelineStage[], options?: PipelineOptions): Promise<unknown>;
  pipeline(...streams: [...PipelineStage[], PipelineOptions] | PipelineStage[]): Promise<unknown>;
}
export interface StreamModule {
  new (options?: { captureRejections?: boolean }): Stream;
  prototype: Stream;
  Stream: StreamModule;
  Readable: ReadableConstructor;
  Writable: WritableConstructor;
  Duplex: DuplexConstructor;
  Transform: TransformConstructor;
  PassThrough: TransformConstructor;
  finished: Finished;
  pipeline: Pipeline;
  promises: StreamPromises;
  compose(...streams: PipelineStage[]): Duplex;
  duplexPair(options?: DuplexOptions): [Duplex, Duplex];
  addAbortSignal<T extends Stream | ReadableStream | WritableStream>(
    signal: AbortSignal,
    stream: T,
  ): T;
  destroy(stream: Stream, error?: Error): void;
  isDestroyed(stream: unknown): boolean;
  isDisturbed(stream: unknown): boolean;
  isErrored(stream: unknown): boolean;
  isReadable(stream: unknown): boolean | null;
  isWritable(stream: unknown): boolean | null;
  getDefaultHighWaterMark(objectMode: boolean): number;
  setDefaultHighWaterMark(objectMode: boolean, value: number): void;
  _isUint8Array(value: unknown): value is Uint8Array;
  _isArrayBufferView(value: unknown): value is ArrayBufferView;
  _uint8ArrayToBuffer(value: Uint8Array): Uint8Array;
}
