import { EventEmitter } from "../internal/event-emitter.js";
import { encode } from "./wire.js";
import { hostCall, unsupported } from "./errors.js";
import type { ServerOperation } from "./host-types.js";
import type {
  AddressInfo,
  ListenOptions,
  NodeTlsModule,
  SecureContextLike,
  SecureContextOptions,
  ServerOptions,
  SocketState,
  TlsSocket,
} from "./types.js";
import type { TlsRuntime, InternalTlsSocketConstructor } from "./runtime.js";

export function createTlsServerClass(
  runtime: TlsRuntime,
  Socket: InternalTlsSocketConstructor,
): NodeTlsModule["Server"] {
  const { host, allocate, listeners, call, normalizeOptions, contextId, isSecureContext } = runtime;
  class Server extends EventEmitter {
    readonly #id = allocate();
    #address: AddressInfo | string | null = null;
    listening = false;
    #nextConnectionQuery = 1;
    #closeCallbacks = new Map<number, (error?: Error) => void>();
    #connectionQueries = new Map<number, (error: Error | null, count: number) => void>();

    constructor(
      optionsOrListener: ServerOptions | ((socket: TlsSocket) => void) = {},
      listener?: (socket: TlsSocket) => void,
    ) {
      super();
      const options = typeof optionsOrListener === "function" ? {} : optionsOrListener;
      const connected = typeof optionsOrListener === "function" ? optionsOrListener : listener;
      if (connected) {
        this.on("secureConnection", connected);
      }
      listeners.set(this.#id, (name, value) => {
        if (name === "close-complete") {
          const { token, error } = value as { token: number; error?: Error };
          const callback = this.#closeCallbacks.get(token);
          this.#closeCallbacks.delete(token);
          callback?.(error);
        } else if (name === "connections") {
          const { token, error, count } = value as { token: number; error?: Error; count: number };
          const callback = this.#connectionQueries.get(token);
          this.#connectionQueries.delete(token);
          callback?.(error ?? null, count);
        } else if (name === "secureConnection") {
          const accepted = value as { id: number; state: SocketState };
          const socket = new Socket(undefined, options, accepted);
          this.emit(name, socket);
        } else if (name === "tlsClientError") {
          const failure = value as { error: Error; socket: { id: number; state: SocketState } };
          this.emit(name, failure.error, new Socket(undefined, options, failure.socket));
        } else if (name === "listening") {
          this.#address = value as AddressInfo;
          this.listening = true;
          this.emit(name);
        } else if (name === "close") {
          this.listening = false;
          this.#address = null;
          this.emit(name);
        } else {
          this.emit(name, value);
        }
      });
      try {
        hostCall(() => host.createServer(this.#id, normalizeOptions(options)));
      } catch (error) {
        listeners.delete(this.#id);
        throw error;
      }
    }

    #checkEvent(event: string): void {
      if (["newSession", "resumeSession", "OCSPRequest", "keylog", "connection"].includes(event)) {
        unsupported(
          `Server event '${event}'`,
          "this server callback is not supported across the component boundary",
        );
      }
    }

    override on(event: string, listener: (...args: never[]) => unknown): this {
      this.#checkEvent(event);
      return super.on(event, listener);
    }
    override addListener(event: string, listener: (...args: never[]) => unknown): this {
      return this.on(event, listener);
    }
    override once(event: string, listener: (...args: never[]) => unknown): this {
      this.#checkEvent(event);
      return super.once(event, listener);
    }
    override prependListener(event: string, listener: (...args: never[]) => unknown): this {
      this.#checkEvent(event);
      return super.prependListener(event, listener);
    }
    override prependOnceListener(event: string, listener: (...args: never[]) => unknown): this {
      this.#checkEvent(event);
      return super.prependOnceListener(event, listener);
    }

    #operation<T>(operation: ServerOperation, ...args: unknown[]): T {
      return call(() => host.serverOperation(this.#id, operation, encode(args)));
    }

    listen(options: ListenOptions, callback?: () => void): this;
    listen(port: number, host?: string | (() => void), callback?: () => void): this;
    listen(path: string, callback?: () => void): this;
    listen(
      value: ListenOptions | number | string,
      hostOrCallback?: string | (() => void),
      callback?: () => void,
    ): this {
      const done = typeof hostOrCallback === "function" ? hostOrCallback : callback;
      if (done) {
        this.once("listening", done);
      }
      const options =
        typeof value === "number"
          ? { port: value, host: typeof hostOrCallback === "string" ? hostOrCallback : undefined }
          : typeof value === "string"
            ? { path: value }
            : value;
      this.#operation("listen", options);
      return this;
    }
    address(): AddressInfo | string | null {
      return this.#address;
    }
    close(callback?: (error?: Error) => void): this {
      const token = this.#nextConnectionQuery++;
      if (callback) {
        this.#closeCallbacks.set(token, callback);
      }
      try {
        this.#operation("close", token);
      } catch (error) {
        this.#closeCallbacks.delete(token);
        throw error;
      }
      this.listening = false;
      this.#address = null;
      return this;
    }

    get maxConnections(): number | undefined {
      return this.#operation<{ maxConnections?: number }>("state").maxConnections;
    }
    set maxConnections(value: number | undefined) {
      this.#operation("max-connections", value);
    }
    get dropMaxConnection(): boolean | undefined {
      return this.#operation<{ dropMaxConnection?: boolean }>("state").dropMaxConnection;
    }
    set dropMaxConnection(value: boolean | undefined) {
      this.#operation("drop-max-connection", value);
    }

    getConnections(callback: (error: Error | null, count: number) => void): this {
      const token = this.#nextConnectionQuery++;
      this.#connectionQueries.set(token, callback);
      try {
        this.#operation("connections", token);
      } catch (error) {
        this.#connectionQueries.delete(token);
        throw error;
      }
      return this;
    }

    getTicketKeys(): Uint8Array {
      return this.#operation("ticket-keys");
    }
    setTicketKeys(keys: Uint8Array): void {
      this.#operation("set-ticket-keys", keys);
    }
    setSecureContext(options: SecureContextOptions): void {
      this.#operation("secure-context", options);
    }
    addContext(hostname: string, value: SecureContextLike | SecureContextOptions): void {
      this.#operation("add-context", hostname, isSecureContext(value) ? contextId(value) : value);
    }
    ref(): this {
      this.#operation("ref");
      return this;
    }
    unref(): this {
      this.#operation("unref");
      return this;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      if (this.listening) {
        await new Promise<void>((resolve, reject) =>
          this.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
  }

  return Server;
}
