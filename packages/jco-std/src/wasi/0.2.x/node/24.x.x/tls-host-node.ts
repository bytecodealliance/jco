/**
 * Opt-in host implementation of WebAssembly/wasi-tls wit/types.wit at
 * 6781ae26084100c0628ef72cc44e4517c6c48ae5 (W3C Community CLA).
 * Local contract: wasi:io@0.2.12 and an availability query.
 * Host trust and deadlines remain host policy.
 */
import {
  callExtension,
  inputStreamId,
  outputStreamId,
  inputStreamCreate,
  outputStreamCreate,
  futureSubscribe,
  futureTakeValue,
  futureDispose,
  createIoError,
} from "@bytecodealliance/preview2-shim/io-worker";
import type { TlsWorkerOperations } from "./tls-host-node-worker.js";
import type {
  InputStream,
  OutputStream,
} from "@bytecodealliance/preview2-shim/interfaces/wasi-io-streams";
import type { Pollable } from "@bytecodealliance/preview2-shim/interfaces/wasi-io-poll";

function tlsCall<Operation extends keyof TlsWorkerOperations>(
  operation: Operation,
  ...args: TlsWorkerOperations[Operation]["args"]
): TlsWorkerOperations[Operation]["result"] {
  // The companion worker implements this operation/result contract; only this host module selects it.
  return callExtension(
    new URL("./tls-host-node-worker.js", import.meta.url),
    operation,
    args,
  ) as TlsWorkerOperations[Operation]["result"];
}

export interface TlsHostOptions {
  ca?: string[];
  handshakeTimeoutMs?: number;
}
export interface IoError {
  toDebugString(): string;
  [Symbol.dispose]?(): void;
}
export type ClientStreamsResult =
  | { tag: "err"; val?: undefined }
  | {
      tag: "ok";
      val:
        | { tag: "err"; val: IoError }
        | { tag: "ok"; val: [ClientConnection, InputStream, OutputStream] };
    };
interface OwnedTransport {
  input: InputStream;
  output: OutputStream;
}
function disposeStream(stream: InputStream | OutputStream): void {
  const drop: unknown = Symbol.dispose in stream ? stream[Symbol.dispose] : undefined;
  if (typeof drop !== "function") {
    throw new TypeError("wasi:tls requires disposable IO resources");
  }
  drop.call(stream);
}

export class ClientConnection {
  readonly #id: number;
  readonly #transport: OwnedTransport;
  #disposed = false;
  constructor(id: number, transport: OwnedTransport) {
    this.#id = id;
    this.#transport = transport;
  }
  closeOutput(): void {
    tlsCall("close-output", this.#id);
  }
  [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    tlsCall("dispose", this.#id);
    disposeStream(this.#transport.output);
    disposeStream(this.#transport.input);
  }
}

export class FutureClientStreams {
  readonly #id: number;
  readonly #connectionId: number;
  readonly #connection: ClientConnection;
  #taken = false;
  #disposed = false;
  constructor(id: number, connectionId: number, transport: OwnedTransport) {
    this.#id = id;
    this.#connectionId = connectionId;
    this.#connection = new ClientConnection(connectionId, transport);
  }
  subscribe(): Pollable {
    return futureSubscribe(this.#id, this);
  }
  get(): ClientStreamsResult | undefined {
    const value:
      | { tag: "err"; val?: undefined }
      | {
          tag: "ok";
          val:
            | { tag: "ok"; val: undefined }
            | { tag: "err"; val: { message: string; code: string } };
        }
      | undefined = futureTakeValue<undefined, { message: string; code: string }>(this.#id);
    if (!value) {
      return undefined;
    }
    if (value.tag === "err") {
      return { tag: "err", val: undefined };
    }
    if (value.val.tag === "err") {
      return { tag: "ok", val: { tag: "err", val: createIoError(value.val.val.message) } };
    }
    const [input, output]: [number, number] = tlsCall("streams", this.#connectionId);
    this.#taken = true;
    return {
      tag: "ok",
      val: {
        tag: "ok",
        val: [this.#connection, inputStreamCreate(input), outputStreamCreate(output)],
      },
    };
  }
  [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    futureDispose(this.#id);
    this.#disposed = true;
    if (!this.#taken) {
      this.#connection[Symbol.dispose]();
    }
  }
}

export interface ClientHandshakeResource {
  [Symbol.dispose](): void;
}
export interface TlsProvider {
  isAvailable(): boolean;
  ClientHandshake: {
    new (serverName: string, input: InputStream, output: OutputStream): ClientHandshakeResource;
    finish(handshake: ClientHandshakeResource): FutureClientStreams;
  };
  ClientConnection: typeof ClientConnection;
  FutureClientStreams: typeof FutureClientStreams;
}

export function createTlsProvider(options: TlsHostOptions = {}): TlsProvider {
  const ca = options.ca?.slice();
  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(handshakeTimeoutMs) || handshakeTimeoutMs <= 0) {
    throw new RangeError("handshakeTimeoutMs must be a positive safe integer");
  }
  class ClientHandshake implements ClientHandshakeResource {
    #transport: OwnedTransport | undefined;
    readonly #serverName: string;
    constructor(serverName: string, input: InputStream, output: OutputStream) {
      this.#serverName = serverName;
      this.#transport = { input, output };
    }
    static finish(value: ClientHandshakeResource): FutureClientStreams {
      if (!(value instanceof ClientHandshake) || !value.#transport) {
        throw new Error("wasi:tls handshake already consumed or belongs to another provider");
      }
      const transport = value.#transport;
      const result: { connection: number; future: number } = tlsCall("start", {
        serverName: value.#serverName,
        input: inputStreamId(transport.input),
        output: outputStreamId(transport.output),
        ca,
        handshakeTimeoutMs,
      });
      value.#transport = undefined;
      return new FutureClientStreams(result.future, result.connection, transport);
    }
    [Symbol.dispose](): void {
      if (this.#transport) {
        disposeStream(this.#transport.output);
        disposeStream(this.#transport.input);
      }
      this.#transport = undefined;
    }
  }
  return { ClientHandshake, ClientConnection, FutureClientStreams, isAvailable };
}

export const { ClientHandshake } = createTlsProvider();

/** Host diagnostics for detecting owned IO resource leaks; not a WIT operation. */
export function _resourceCounts(): {
  tls: number;
  streams: number;
  futures: number;
  polls: number;
  sockets: number;
} {
  return tlsCall("counts");
}

/** Availability query in Jco's local TLS contract. */
export function isAvailable(): boolean {
  return true;
}
