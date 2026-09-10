import type { ConnectionOptions, ServerOptions } from "./types.js";
import type { WasiInputStream, WasiOutputStream } from "../internal/wasi-sockets.js";
import type { WasiTlsFuture } from "../http/impl/wasi-sockets/tls.js";
/** Runtime-neutral contract for the explicitly granted jco:node/tls capability. */
export type SocketOperation =
  | "state"
  | "address"
  | "certificate"
  | "peer-certificate"
  | "cipher"
  | "ephemeral-key-info"
  | "finished"
  | "peer-finished"
  | "protocol"
  | "session"
  | "shared-sigalgs"
  | "tls-ticket"
  | "session-reused"
  | "export-keying-material"
  | "disable-renegotiation"
  | "enable-trace"
  | "max-send-fragment"
  | "key-cert"
  | "timeout"
  | "no-delay"
  | "keep-alive"
  | "ref"
  | "unref"
  | "resume"
  | "pause"
  | "destroy"
  | "renegotiate"
  | "set-session"
  | "set-servername";

export type ServerOperation =
  | "state"
  | "address"
  | "listen"
  | "close"
  | "connections"
  | "ref"
  | "unref"
  | "ticket-keys"
  | "set-ticket-keys"
  | "secure-context"
  | "add-context"
  | "max-connections"
  | "drop-max-connection";

export type Query = "ciphers" | "compression-algorithms" | "ca-certificates" | "check-identity";

export interface TlsEvent {
  target: number;
  name: string;
  value: string;
  data: Uint8Array;
}

export interface TlsCallbacks {
  dispatch(event: TlsEvent): void | Promise<void>;
}

export interface TlsStreamHost {
  isAvailable(): boolean;
  startTls(serverName: string, input: WasiInputStream, output: WasiOutputStream): WasiTlsFuture;
}

export interface TlsHost extends TlsStreamHost {
  query(operation: Query, args: string): string;
  setDefaultCa(certs: string): void;
  createContext(options: string): number;
  releaseContext(id: number): void;
  connect(id: number, options: string): void;
  createServer(id: number, options: string): void;
  socketOperation(id: number, operation: SocketOperation, args: string): string;
  serverOperation(id: number, operation: ServerOperation, args: string): string;
  write(id: number, token: number, data: Uint8Array): void;
  end(id: number, token: number): void;
  release(id: number): void;
}

/** Local integration contract for HTTP hosts consuming one-use TLS configurations. */
export interface TlsConfigurationProvider {
  takeContextOptions(id: number): ConnectionOptions & ServerOptions;
}
