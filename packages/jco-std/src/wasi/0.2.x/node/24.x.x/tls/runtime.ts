import type { TlsHost } from "./host-types.js";
import type {
  ConnectionOptions,
  SecureContextLike,
  ServerOptions,
  SocketState,
  TlsSocket,
} from "./types.js";

export interface TlsRuntime {
  host: TlsHost;
  allocate(): number;
  listeners: Map<number, (name: string, value: unknown, data: Uint8Array) => void>;
  call<T>(operation: () => string): T;
  normalizeOptions(options: ConnectionOptions | ServerOptions): string;
  contextId(value: SecureContextLike): number;
  isSecureContext(value: unknown): value is SecureContextLike;
}

export interface InternalTlsSocket extends TlsSocket {
  start(options: ConnectionOptions): this;
}

export interface InternalTlsSocketConstructor {
  new (
    socket?: unknown,
    options?: ConnectionOptions,
    accepted?: { id: number; state: SocketState },
    factory?: boolean,
  ): InternalTlsSocket;
}
