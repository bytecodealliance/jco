/**
 * Opt-in host implementation of WebAssembly/wasi-tls wit/types.wit at
 * 6781ae26084100c0628ef72cc44e4517c6c48ae5 (W3C Community CLA).
 * The upstream interface is unchanged; host trust and deadlines are local policy.
 */
import {
    ioCall,
    inputStreamId,
    outputStreamId,
    inputStreamCreate,
    outputStreamCreate,
    pollableCreate,
    error,
} from "../io/worker-io.js";
import {
    TLS_START,
    TLS_STREAMS,
    TLS_CLOSE_OUTPUT,
    TLS_DISPOSE,
    TLS_RESOURCE_COUNTS,
    SOCKET_TCP,
    FUTURE_TAKE_VALUE,
    FUTURE_SUBSCRIBE,
    FUTURE_DISPOSE,
} from "../io/calls.js";
import type { InputStream, OutputStream } from "../../types/interfaces/wasi-io-streams.js";
import type { Pollable } from "../../types/interfaces/wasi-io-poll.js";

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
        ioCall(TLS_CLOSE_OUTPUT, this.#id, undefined);
    }
    [Symbol.dispose](): void {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        ioCall(TLS_DISPOSE, this.#id, undefined);
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
        return pollableCreate(ioCall(FUTURE_SUBSCRIBE, this.#id, undefined), this);
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
            | undefined = ioCall(FUTURE_TAKE_VALUE, this.#id, undefined);
        if (!value) {
            return undefined;
        }
        if (value.tag === "err") {
            return { tag: "err", val: undefined };
        }
        if (value.val.tag === "err") {
            return { tag: "ok", val: { tag: "err", val: new error.Error(value.val.val.message) } };
        }
        const [input, output]: [number, number] = ioCall(
            TLS_STREAMS,
            this.#connectionId,
            undefined,
        );
        this.#taken = true;
        return {
            tag: "ok",
            val: {
                tag: "ok",
                val: [
                    this.#connection,
                    inputStreamCreate(SOCKET_TCP, input),
                    outputStreamCreate(SOCKET_TCP, output),
                ],
            },
        };
    }
    [Symbol.dispose](): void {
        if (this.#disposed) {
            return;
        }
        ioCall(FUTURE_DISPOSE, this.#id, undefined);
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
                throw new Error(
                    "wasi:tls handshake already consumed or belongs to another provider",
                );
            }
            const transport = value.#transport;
            const result: { connection: number; future: number } = ioCall(TLS_START, null, {
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
    return { ClientHandshake, ClientConnection, FutureClientStreams };
}

export const { ClientHandshake } = createTlsProvider();

/** Own-to-own version conversion: preserve the actual stream resources and connection. */
export function adapt(input: InputStream, output: OutputStream): [InputStream, OutputStream] {
    return [input, output];
}

/** Host diagnostics for detecting owned IO resource leaks; not a WIT operation. */
export function _resourceCounts(): {
    tls: number;
    streams: number;
    futures: number;
    polls: number;
    sockets: number;
} {
    return ioCall(TLS_RESOURCE_COUNTS, null, undefined);
}

/** Jco IO version bridge capability check; not a wasi:tls operation. */
export function isAvailable(): boolean {
    return true;
}
