/** Native TLS over the streams already owned by the Preview 2 IO worker. */
import { Duplex, Readable, Writable } from "node:stream";
import { connect, checkServerIdentity, type TLSSocket } from "node:tls";
import { isIP } from "node:net";
import type {
  WorkerExtension,
  WorkerExtensionContext,
} from "@bytecodealliance/preview2-shim/io-worker";

export interface TlsStartOptions {
  serverName: string;
  input: number;
  output: number;
  ca?: string[];
  handshakeTimeoutMs: number;
}
export interface TlsWorkerOperations {
  start: { args: [TlsStartOptions]; result: { connection: number; future: number } };
  streams: { args: [number]; result: [number, number] };
  "close-output": { args: [number]; result: void };
  dispose: { args: [number]; result: void };
  counts: {
    args: [];
    result: { tls: number; streams: number; futures: number; polls: number; sockets: number };
  };
}
interface Connection {
  socket: TLSSocket;
  timer: ReturnType<typeof setTimeout>;
}
export default function createTlsWorker(context: WorkerExtensionContext): WorkerExtension {
  const { createFuture, createReadableStream, createWritableStream } = context;
  const connections = new Map<number, Connection>();
  let nextId = 0;

  function tlsStart(options: TlsStartOptions): { connection: number; future: number } {
    const readable: unknown = context.getStream(options.input);
    const writable: unknown = context.getStream(options.output);
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
    );
    return { connection, future };
  }

  function tlsCloseOutput(id: number): Promise<void> {
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

  function tlsDispose(id: number): void {
    const connection = connections.get(id);
    if (!connection) {
      return;
    }
    clearTimeout(connection.timer);
    connection.socket.destroy();
    connections.delete(id);
  }

  function tlsStreams(id: number): [number, number] {
    const socket = connections.get(id)!.socket;
    return [createReadableStream(socket), createWritableStream(socket)];
  }

  function tlsConnectionCount(): number {
    return connections.size;
  }

  return (operation: string, args: unknown[]): unknown => {
    const value = args[0];
    if (operation === "start") {
      if (
        typeof value !== "object" ||
        value === null ||
        !("serverName" in value) ||
        typeof value.serverName !== "string" ||
        !("input" in value) ||
        typeof value.input !== "number" ||
        !("output" in value) ||
        typeof value.output !== "number" ||
        !("handshakeTimeoutMs" in value) ||
        typeof value.handshakeTimeoutMs !== "number"
      ) {
        throw new TypeError("Invalid TLS worker request");
      }
      const ca = "ca" in value ? value.ca : undefined;
      if (
        ca !== undefined &&
        (!Array.isArray(ca) || !ca.every((item: unknown) => typeof item === "string"))
      ) {
        throw new TypeError("Invalid TLS trust roots");
      }
      return tlsStart({
        serverName: value.serverName,
        input: value.input,
        output: value.output,
        handshakeTimeoutMs: value.handshakeTimeoutMs,
        ca,
      });
    }
    if (operation === "counts") {
      return { tls: tlsConnectionCount(), ...context.resourceCounts() };
    }
    if (typeof value !== "number") {
      throw new TypeError("Invalid TLS resource identifier");
    }
    switch (operation) {
      case "streams":
        return tlsStreams(value);
      case "close-output":
        return tlsCloseOutput(value);
      case "dispose":
        return tlsDispose(value);
      default:
        throw new Error(`Unknown TLS operation: ${operation}`);
    }
  };
}
