import { Buffer } from "node:buffer";
import { Duplex } from "../stream/index.js";
import type { Callback } from "../stream/types.js";
import { encode } from "./wire.js";
import { hostCall, unsupported } from "./errors.js";
import type { SocketOperation } from "./host-types.js";
import type {
  AddressInfo,
  CipherNameAndProtocol,
  ConnectionOptions,
  EphemeralKeyInfo,
  PeerCertificate,
  SecureContextLike,
  SecureContextOptions,
  SocketState,
} from "./types.js";
import type { TlsRuntime, InternalTlsSocketConstructor } from "./runtime.js";

export function createTlsSocketClass(runtime: TlsRuntime): InternalTlsSocketConstructor {
  const { host, allocate, listeners, call, normalizeOptions, contextId, isSecureContext } = runtime;
  class TLSSocket extends Duplex {
    readonly encrypted = true;
    authorized = false;
    authorizationError: Error | string | undefined;
    alpnProtocol: string | false = false;
    servername: string | false = false;
    connecting = true;
    pending = true;
    readonly id: number;
    #state: SocketState = {};
    #ready = false;
    #started = false;
    #abort: (() => void) | undefined;
    #readRequested = false;
    #token = 1;
    #writes = new Map<number, Callback>();
    #pendingWrite: (() => void) | undefined;
    #options: ConnectionOptions;

    constructor(
      socket?: unknown,
      options: ConnectionOptions = {},
      accepted?: { id: number; state: SocketState },
      factory = false,
    ) {
      if (socket !== undefined || (!accepted && !factory)) {
        unsupported(
          "TLSSocket",
          "use tls.connect(); wrapping arbitrary guest sockets is not supported",
        );
      }
      super({
        allowHalfOpen: options.allowHalfOpen ?? false,
        highWaterMark: options.highWaterMark,
      });
      this.id = accepted?.id ?? allocate();
      this.#options = options;
      this.#started = accepted !== undefined;
      if (options.signal) {
        const signal = options.signal;
        this.#abort = () =>
          this.destroy(
            Object.assign(new Error("The operation was aborted", { cause: signal.reason }), {
              name: "AbortError",
              code: "ABORT_ERR",
            }),
          );
        signal.addEventListener("abort", this.#abort, { once: true });
      }
      listeners.set(this.id, (name, value, data) => this.#dispatch(name, value, data));
      if (accepted) {
        this.#setState(accepted.state);
        this.#ready = true;
        this.connecting = false;
        this.pending = false;
      }
    }

    start(options: ConnectionOptions): this {
      try {
        const normalized = normalizeOptions(options);
        if (this.#options.signal?.aborted) {
          queueMicrotask(this.#abort!);
          return this;
        }
        hostCall(() => host.connect(this.id, normalized));
        this.#started = true;
      } catch (error) {
        listeners.delete(this.id);
        throw error;
      }
      return this;
    }

    #operation<T>(operation: SocketOperation, ...args: unknown[]): T {
      return call(() => host.socketOperation(this.id, operation, encode(args)));
    }

    #setState(state: SocketState): void {
      this.#state = state;
      this.authorized = state.authorized ?? false;
      this.authorizationError = state.authorizationError;
      this.alpnProtocol = state.alpnProtocol ?? false;
      this.servername = state.servername ?? false;
    }

    #dispatch(name: string, value: unknown, data: Uint8Array): void {
      if (name === "write" || name === "renegotiate") {
        const result = value as { token: number; error?: Error };
        const callback = this.#writes.get(result.token);
        this.#writes.delete(result.token);
        callback?.(result.error);
        return;
      }
      if (name === "secureConnect") {
        this.#setState(value as SocketState);
        const check = this.#options.checkServerIdentity;
        if (check && this.authorized) {
          let error: Error | null | undefined;
          try {
            error = check(
              this.#options.servername || this.#options.host || "localhost",
              this.getPeerCertificate(),
            );
          } catch (failure) {
            error = failure as Error;
          }
          if (error) {
            this.authorized = false;
            this.authorizationError = (error as Error & { code?: string }).code || error.message;
            if (this.#options.rejectUnauthorized !== false) {
              this.destroy(error);
              return;
            }
          }
        }
        this.connecting = false;
        this.pending = false;
        this.#ready = true;
        this.emit("secureConnect");
        if (this.destroyed) {
          return;
        }
        this.#pendingWrite?.();
        this.#pendingWrite = undefined;
        if (this.#readRequested) {
          this.#operation("resume");
        }
      } else if (name === "data") {
        if (this.push(Buffer.from(data))) {
          this.#operation("resume");
        }
      } else if (name === "end") {
        this.push(null);
      } else if (name === "error") {
        this.destroy(value as Error);
      } else if (name === "close") {
        if (!this.destroyed) {
          this.destroy();
        }
      } else if (name === "session" || name === "keylog") {
        this.emit(name, Buffer.from(data));
      } else if (name === "connect" || name === "timeout") {
        this.emit(name);
      } else {
        this.emit(name, value);
      }
    }

    override _read(): void {
      this.#readRequested = true;
      if (this.#ready && !this.destroyed) {
        this.#operation("resume");
      }
    }

    override _write(chunk: unknown, _encoding: string, callback: Callback): void {
      this.#sendWrite(chunk as Uint8Array, callback);
    }

    #sendWrite(data: Uint8Array | undefined, callback: Callback): void {
      const token = this.#token++;
      this.#writes.set(token, callback);
      const send = () => {
        try {
          hostCall(() =>
            data === undefined ? host.end(this.id, token) : host.write(this.id, token, data),
          );
        } catch (error) {
          this.#writes.delete(token);
          callback(error as Error);
        }
      };
      if (this.#ready) {
        send();
      } else {
        this.#pendingWrite = send;
      }
    }

    override _final(callback: Callback): void {
      this.#sendWrite(undefined, callback);
    }

    override _destroy(error: Error | null, callback: Callback): void {
      listeners.delete(this.id);
      this.#pendingWrite = undefined;
      if (this.#abort) {
        this.#options.signal?.removeEventListener("abort", this.#abort);
      }
      if (this.#started) {
        host.release(this.id);
      }
      for (const done of this.#writes.values()) {
        done(error ?? new Error("TLS socket closed"));
      }
      this.#writes.clear();
      callback(error);
    }

    get localAddress(): string | undefined {
      return this.#state.localAddress;
    }
    get localPort(): number | undefined {
      return this.#state.localPort;
    }
    get localFamily(): string | undefined {
      return this.#state.localFamily;
    }
    get remoteAddress(): string | undefined {
      return this.#state.remoteAddress;
    }
    get remotePort(): number | undefined {
      return this.#state.remotePort;
    }
    get remoteFamily(): string | undefined {
      return this.#state.remoteFamily;
    }
    get bytesRead(): number {
      return this.destroyed
        ? (this.#state.bytesRead ?? 0)
        : (this.#operation<SocketState>("state").bytesRead ?? 0);
    }
    get bytesWritten(): number {
      return this.destroyed
        ? (this.#state.bytesWritten ?? 0)
        : (this.#operation<SocketState>("state").bytesWritten ?? 0);
    }
    address(): AddressInfo | object {
      return this.#operation("address");
    }
    getCertificate(): PeerCertificate | object {
      return this.#operation("certificate");
    }
    getPeerCertificate(detailed = false): PeerCertificate {
      return this.#operation("peer-certificate", detailed);
    }
    getCipher(): CipherNameAndProtocol {
      return this.#operation("cipher");
    }
    getEphemeralKeyInfo(): EphemeralKeyInfo | object | null {
      return this.#operation("ephemeral-key-info");
    }
    getFinished(): Uint8Array | undefined {
      return this.#operation("finished");
    }
    getPeerFinished(): Uint8Array | undefined {
      return this.#operation("peer-finished");
    }
    getProtocol(): string | null {
      return this.#operation("protocol");
    }
    setSession(session: Uint8Array | string): void {
      this.#operation("set-session", session);
    }
    setServername(name: string): void {
      this.#operation("set-servername", name);
    }
    getSession(): Uint8Array | undefined {
      return this.#operation("session");
    }
    getSharedSigalgs(): string[] {
      return this.#operation("shared-sigalgs");
    }
    getTLSTicket(): Uint8Array | undefined {
      return this.#operation("tls-ticket");
    }
    isSessionReused(): boolean {
      return this.#operation("session-reused");
    }
    exportKeyingMaterial(length: number, label: string, context?: Uint8Array): Uint8Array {
      return this.#operation("export-keying-material", length, label, context);
    }
    disableRenegotiation(): void {
      this.#operation("disable-renegotiation");
    }
    enableTrace(): void {
      this.#operation("enable-trace");
    }
    setMaxSendFragment(size: number): boolean {
      return this.#operation("max-send-fragment", size);
    }
    setKeyCert(value: SecureContextLike | SecureContextOptions): void {
      this.#operation("key-cert", isSecureContext(value) ? contextId(value) : value);
    }
    getPeerX509Certificate(): never {
      return unsupported(
        "TLSSocket.getPeerX509Certificate",
        "use getPeerCertificate(); native crypto.X509Certificate objects cannot cross WIT",
      );
    }
    getX509Certificate(): never {
      return unsupported(
        "TLSSocket.getX509Certificate",
        "use getCertificate(); native crypto.X509Certificate objects cannot cross WIT",
      );
    }
    setTimeout(timeout: number, callback?: () => void): this {
      if (callback) {
        this.once("timeout", callback);
      }
      this.#operation("timeout", timeout);
      return this;
    }
    setNoDelay(noDelay = true): this {
      this.#operation("no-delay", noDelay);
      return this;
    }
    setKeepAlive(enable = false, initialDelay = 0): this {
      this.#operation("keep-alive", enable, initialDelay);
      return this;
    }
    ref(): this {
      this.#operation("ref");
      return this;
    }
    unref(): this {
      this.#operation("unref");
      return this;
    }
    renegotiate(
      options: { rejectUnauthorized?: boolean; requestCert?: boolean },
      callback: Callback,
    ): boolean {
      const token = this.#token++;
      this.#writes.set(token, callback);
      return this.#operation("renegotiate", options, token);
    }
  }

  return TLSSocket;
}
