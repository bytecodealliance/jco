/** Native TLS over the streams already owned by the Preview 2 IO worker. */
import { Duplex, Readable, Writable } from "node:stream";
import { connect, checkServerIdentity, type TLSSocket } from "node:tls";
import { isIP } from "node:net";
import {
    createFuture,
    createReadableStream,
    createWritableStream,
    getStreamOrThrow,
} from "./worker-thread.js";

export interface TlsStartOptions {
    serverName: string;
    input: number;
    output: number;
    ca?: string[];
    handshakeTimeoutMs: number;
}
interface Connection {
    socket: TLSSocket;
    timer: ReturnType<typeof setTimeout>;
}
const connections = new Map<number, Connection>();
let nextId = 0;

export function tlsStart(options: TlsStartOptions): { connection: number; future: number } {
    const readable: unknown = getStreamOrThrow(options.input).stream;
    const writable: unknown = getStreamOrThrow(options.output).stream;
    if (!(readable instanceof Readable) || !(writable instanceof Writable)) {
        throw new Error("wasi:tls requires Node-backed readable and writable streams");
    }
    // This Duplex consumes precisely the supplied streams. No DNS lookup or replacement
    // TCP connection is possible: tls.connect receives an already-connected transport.
    const transport = Duplex.from({ readable, writable });
    const socket = connect({
        socket: transport,
        servername: isIP(options.serverName) ? undefined : options.serverName,
        rejectUnauthorized: true,
        checkServerIdentity: (_host, certificate) =>
            checkServerIdentity(options.serverName, certificate),
        ALPNProtocols: ["http/1.1"],
        ca: options.ca,
    });
    // Duplex.from may emit AbortError when TLS destroys an incomplete transport.
    // Keep an error listener for the whole transport lifetime, including shutdown.
    transport.on("error", (error: Error): void => {
        socket.destroy(error);
    });
    const connection = ++nextId;
    const timer = setTimeout(
        () => socket.destroy(new Error("TLS handshake timed out")),
        options.handshakeTimeoutMs,
    );
    connections.set(connection, { socket, timer });
    const future = createFuture(
        new Promise<void>((resolve, reject) => {
            const fail = (error: Error): void => {
                clearTimeout(timer);
                reject({
                    message: error.message,
                    code: "code" in error ? String(error.code) : "ERR_TLS_HANDSHAKE",
                });
            };
            socket.on("error", fail);
            socket.once("close", () => fail(new Error("TLS connection closed during handshake")));
            socket.once("secureConnect", () => {
                clearTimeout(timer);
                if (socket.alpnProtocol && socket.alpnProtocol !== "http/1.1") {
                    socket.destroy(new Error("TLS peer negotiated a protocol other than HTTP/1.1"));
                    return;
                }
                resolve();
            });
        }),
        undefined,
    );
    return { connection, future };
}

export function tlsCloseOutput(id: number): Promise<void> {
    const connection = connections.get(id);
    if (!connection) {
        throw new Error("wasi:tls connection was disposed");
    }
    return new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        connection.socket.once("error", onError);
        connection.socket.end(() => {
            connection.socket.off("error", onError);
            resolve();
        });
    });
}

export function tlsDispose(id: number): void {
    const connection = connections.get(id);
    if (!connection) {
        return;
    }
    clearTimeout(connection.timer);
    connection.socket.destroy();
    connections.delete(id);
}

export function tlsStreams(id: number): [number, number] {
    const socket = connections.get(id)!.socket;
    return [createReadableStream(socket), createWritableStream(socket)];
}

export function tlsConnectionCount(): number {
    return connections.size;
}
