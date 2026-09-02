import { EventEmitter } from "../internal/event-emitter.js";
import { bodyBytes } from "../http/body.js";
import { constants } from "./constants.js";
import { invalidArgType, unsupported } from "./errors.js";
import { headersToFields } from "./headers.js";
import { validateSettings } from "./settings.js";
import { ClientHttp2Stream } from "./stream.js";
import type {
  Http2ClientOptions,
  Http2ClientSessionImplementation,
  Http2Headers,
  Http2PingResponse,
  Http2RequestOptions,
  Http2SessionInfo,
  Http2SessionState,
  Http2Settings,
} from "./types.js";

export type ConnectListener = (session: ClientHttp2Session, socket: unknown) => void;
export type SettingsCallback = (
  error: Error | null,
  settings: Http2Settings,
  duration: number,
) => void;
export type PingCallback = (error: Error | null, duration: number, payload: Uint8Array) => void;

const SUPPORTED_CLIENT_OPTIONS = new Set([
  "settings",
  "rejectUnauthorized",
  "servername",
  "ca",
  "protocol",
]);

function validateClientOptions(options: Http2ClientOptions): Http2ClientOptions {
  if (typeof options !== "object" || options === null) {
    throw invalidArgType("options", "object", options);
  }
  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined && !SUPPORTED_CLIENT_OPTIONS.has(name)) {
      unsupported(
        `http2.connect option ${name}`,
        "this option cannot be represented by the typed HTTP/2 provider boundary",
      );
    }
  }
  if (options.settings !== undefined) {
    validateSettings(options.settings);
  }
  if (
    options.protocol !== undefined &&
    options.protocol !== "http:" &&
    options.protocol !== "https:"
  ) {
    throw Object.assign(new TypeError(`Protocol "${String(options.protocol)}" not supported.`), {
      code: "ERR_HTTP2_UNSUPPORTED_PROTOCOL",
    });
  }
  return { ...options };
}

function authorityUrl(authority: string | URL, options: Http2ClientOptions): URL {
  if (!(typeof authority === "string" || authority instanceof URL)) {
    throw invalidArgType("authority", "string, object, or URL", authority);
  }
  try {
    const value = authority instanceof URL ? new URL(authority.href) : new URL(authority);
    if (!value.protocol && options.protocol) {
      value.protocol = options.protocol;
    }
    if (value.protocol !== "http:" && value.protocol !== "https:") {
      throw Object.assign(new TypeError(`Protocol "${value.protocol}" not supported.`), {
        code: "ERR_HTTP2_UNSUPPORTED_PROTOCOL",
      });
    }
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      throw error;
    }
    throw Object.assign(new TypeError(`Invalid URL: ${String(authority)}`), {
      code: "ERR_INVALID_URL",
    });
  }
}

export class ClientHttp2Session extends EventEmitter {
  readonly type = constants.NGHTTP2_SESSION_CLIENT;
  connecting = true;
  closed = false;
  destroyed = false;
  pendingSettingsAck = false;
  alpnProtocol: string | undefined;
  encrypted: boolean | undefined;
  localSettings: Http2Settings = {};
  remoteSettings: Http2Settings = {};
  originSet: string[] | undefined;
  readonly #authority: URL;
  readonly #implementation: Http2ClientSessionImplementation;

  constructor(
    implementation: Http2ClientSessionImplementation,
    authority: URL,
    listener?: ConnectListener,
  ) {
    super();
    this.#implementation = implementation;
    this.#authority = authority;
    if (listener) {
      this.once("connect", listener);
    }
    queueMicrotask(() => {
      if (this.destroyed) {
        return;
      }
      try {
        this.#setInfo(implementation.ready());
        this.emit("connect", this, undefined);
      } catch (error) {
        this.connecting = false;
        this.destroyed = true;
        this.closed = true;
        this.emit("error", error instanceof Error ? error : new Error(String(error)));
        this.emit("close");
      }
    });
  }

  get socket(): never {
    return unsupported(
      "http2.Http2Session.socket",
      "host net.Socket and TLSSocket objects cannot cross the component boundary",
    );
  }

  get state(): Http2SessionState {
    return unsupported(
      "http2.Http2Session.state",
      "the host session state is not exposed by the typed component boundary",
    );
  }

  request(
    headers: Http2Headers | readonly string[] = {},
    options: Http2RequestOptions = {},
  ): ClientHttp2Stream {
    if (this.closed || this.destroyed) {
      throw Object.assign(new Error("The session has been destroyed"), {
        code: "ERR_HTTP2_INVALID_SESSION",
      });
    }
    if (options.signal !== undefined) {
      unsupported(
        "http2.ClientHttp2Session.request signal",
        "AbortSignal cannot be retained by the host-owned stream resource",
      );
    }
    if (options.exclusive !== undefined || options.parent !== undefined) {
      unsupported(
        "http2.ClientHttp2Session.request priority options",
        "HTTP/2 priority signaling is deprecated upstream",
      );
    }
    const requested = headersToFields(headers);
    const names = new Set(requested.map(({ name }) => name));
    const defaults = headersToFields({
      ...(names.has(":method") ? {} : { ":method": "GET" }),
      ...(names.has(":path") ? {} : { ":path": "/" }),
      ...(names.has(":scheme") ? {} : { ":scheme": this.#authority.protocol.slice(0, -1) }),
      ...(names.has(":authority") ? {} : { ":authority": this.#authority.host }),
    });
    const implementation = this.#implementation.request([...defaults, ...requested], {
      endStream: options.endStream,
      waitForTrailers: options.waitForTrailers,
    });
    const stream = new ClientHttp2Stream(
      implementation,
      Object.fromEntries(
        [...defaults, ...requested].map(({ name, value }) => [
          name,
          new TextDecoder("latin1").decode(value),
        ]),
      ),
      this,
    );
    if (options.endStream) {
      stream.end();
    }
    return stream;
  }

  close(callback?: () => void): void {
    if (this.closed) {
      if (callback) {
        queueMicrotask(callback);
      }
      return;
    }
    this.#implementation.close();
    this.closed = true;
    queueMicrotask(() => {
      callback?.();
      this.emit("close");
    });
  }

  destroy(
    error?: Error,
    code = error ? constants.NGHTTP2_INTERNAL_ERROR : constants.NGHTTP2_NO_ERROR,
  ): void {
    if (this.destroyed) {
      return;
    }
    this.#implementation.destroy(code);
    this.destroyed = true;
    this.closed = true;
    queueMicrotask(() => {
      if (error) {
        this.emit("error", error);
      }
      this.emit("close");
    });
  }

  settings(settings: Http2Settings = {}, callback?: SettingsCallback): void {
    const validated = validateSettings(settings);
    this.pendingSettingsAck = true;
    const started = Date.now();
    try {
      const accepted = this.#implementation.settings(validated);
      this.localSettings = accepted;
      this.pendingSettingsAck = false;
      queueMicrotask(() => {
        this.emit("localSettings", accepted);
        callback?.(null, accepted, Date.now() - started);
      });
    } catch (error) {
      this.pendingSettingsAck = false;
      const value = error instanceof Error ? error : new Error(String(error));
      queueMicrotask(() => callback?.(value, validated, Date.now() - started));
    }
  }

  ping(callback: PingCallback): boolean;
  ping(payload: ArrayBufferView, callback: PingCallback): boolean;
  ping(payloadOrCallback: ArrayBufferView | PingCallback, callback?: PingCallback): boolean {
    const actualCallback = typeof payloadOrCallback === "function" ? payloadOrCallback : callback;
    if (!actualCallback) {
      throw invalidArgType("callback", "function", actualCallback);
    }
    const payload =
      typeof payloadOrCallback === "function" ? new Uint8Array(8) : bodyBytes(payloadOrCallback);
    if (payload.byteLength !== 8) {
      throw Object.assign(new RangeError("HTTP2 ping payload must be 8 bytes"), {
        code: "ERR_HTTP2_PING_LENGTH",
      });
    }
    try {
      const result: Http2PingResponse = this.#implementation.ping(payload);
      queueMicrotask(() => {
        this.emit("ping", result.payload);
        actualCallback(null, result.durationMs, result.payload);
      });
      return true;
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error));
      queueMicrotask(() => actualCallback(value, 0, payload));
      return false;
    }
  }

  goaway(
    code = constants.NGHTTP2_NO_ERROR,
    lastStreamId?: number,
    opaqueData: ArrayBufferView = new Uint8Array(),
  ): void {
    this.#implementation.goaway(code, lastStreamId, bodyBytes(opaqueData));
  }

  setLocalWindowSize(_windowSize: number): never {
    return unsupported(
      "http2.Http2Session.setLocalWindowSize",
      "flow-control windows are owned by the host HTTP/2 implementation",
    );
  }

  setTimeout(milliseconds: number, callback?: () => void): this {
    if (milliseconds !== 0 || callback !== undefined) {
      unsupported(
        "http2.Http2Session.setTimeout",
        "timeout callbacks cannot be retained across the typed component boundary",
      );
    }
    return this;
  }

  ref(): void {
    this.#implementation.ref();
  }

  unref(): void {
    this.#implementation.unref();
  }

  #setInfo(info: Http2SessionInfo): void {
    this.connecting = false;
    this.alpnProtocol = info.alpnProtocol;
    this.encrypted = info.encrypted;
    this.localSettings = info.localSettings;
    this.remoteSettings = info.remoteSettings;
  }
}

export function createConnection(
  implementationFactory: (
    authority: string,
    options: Http2ClientOptions,
  ) => Http2ClientSessionImplementation,
  authority: string | URL,
  optionsOrListener: Http2ClientOptions | ConnectListener = {},
  listener?: ConnectListener,
): ClientHttp2Session {
  const options = validateClientOptions(
    typeof optionsOrListener === "function" ? {} : optionsOrListener,
  );
  const actualListener = typeof optionsOrListener === "function" ? optionsOrListener : listener;
  const url = authorityUrl(authority, options);
  const session = implementationFactory(url.origin, options);
  return new ClientHttp2Session(session, url, actualListener);
}
