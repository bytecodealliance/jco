import { createTlsSocketClass } from "./socket.js";
import { createTlsServerClass } from "./server.js";
import type { InternalTlsSocket } from "./runtime.js";
import { convertALPNProtocols } from "./alpn.js";
import { lazyCertificates } from "./certificates.js";
import { encode, decode } from "./wire.js";
import { hostCall, unsupported } from "./errors.js";
import type { TlsCallbacks, TlsHost } from "./host-types.js";
import type {
  ConnectionOptions,
  SecureContextOptions,
  ServerOptions,
  TLSVersion,
  TlsSocket,
  TlsServer,
  PeerCertificate,
} from "./types.js";

export function createTls(host: TlsHost): {
  api: import("./types.js").NodeTlsModule;
  tlsCallbacks: TlsCallbacks;
} {
  let nextId = 1;
  const listeners = new Map<number, (name: string, value: unknown, data: Uint8Array) => void>();
  const contexts = new WeakMap<SecureContext, number>();
  const caCache = new Map<string, readonly string[]>();
  const call = <T>(operation: () => string): T => decode(hostCall(operation)) as T;

  class SecureContext {
    readonly context: object = {};
    constructor(options: SecureContextOptions = {}) {
      contexts.set(
        this,
        hostCall(() => host.createContext(encode(defaultOptions(options)))),
      );
    }
  }

  function defaultOptions<T extends SecureContextOptions>(options: T): T {
    return {
      ciphers: api.DEFAULT_CIPHERS,
      ecdhCurve: api.DEFAULT_ECDH_CURVE,
      ...(options.secureProtocol === undefined
        ? { minVersion: api.DEFAULT_MIN_VERSION, maxVersion: api.DEFAULT_MAX_VERSION }
        : {}),
      ...options,
    };
  }

  function contextId(value: SecureContext): number {
    const id = contexts.get(value);
    if (id === undefined) {
      throw new TypeError("SecureContext belongs to another TLS implementation");
    }
    return id;
  }

  function normalizeOptions(options: ConnectionOptions | ServerOptions): string {
    for (const name of [
      "socket",
      "pskCallback",
      "lookup",
      "SNICallback",
      "ALPNCallback",
      "clientCertEngine",
      "privateKeyEngine",
      "privateKeyIdentifier",
    ] as const) {
      if (name in options && Reflect.get(options, name) !== undefined) {
        unsupported(`options.${name}`);
      }
    }
    if (
      "checkServerIdentity" in options &&
      options.checkServerIdentity !== undefined &&
      typeof options.checkServerIdentity !== "function"
    ) {
      throw Object.assign(new TypeError("checkServerIdentity must be a function"), {
        code: "ERR_INVALID_ARG_TYPE",
      });
    }
    const {
      secureContext,
      checkServerIdentity,
      signal: _signal,
      ...values
    } = options as ConnectionOptions;
    return encode({
      ...defaultOptions(values),
      ...(secureContext === undefined
        ? {}
        : { contextId: contextId(secureContext as SecureContext) }),
      ...(checkServerIdentity === undefined ? {} : { customIdentity: true }),
    });
  }

  const runtime = {
    host,
    listeners,
    call,
    normalizeOptions,
    contextId,
    allocate: () => {
      if (nextId >= 0x40000000) {
        throw new Error("TLS handle space exhausted");
      }
      return nextId++;
    },
    isSecureContext: (value: unknown): value is SecureContext => value instanceof SecureContext,
  };
  const TLSSocket = createTlsSocketClass(runtime);
  const Server = createTlsServerClass(runtime, TLSSocket);

  function connect(options: ConnectionOptions, callback?: () => void): InternalTlsSocket;
  function connect(
    port: number,
    options?: ConnectionOptions,
    callback?: () => void,
  ): InternalTlsSocket;
  function connect(
    port: number,
    host?: string,
    options?: ConnectionOptions,
    callback?: () => void,
  ): InternalTlsSocket;
  function connect(
    path: string,
    options?: ConnectionOptions,
    callback?: () => void,
  ): InternalTlsSocket;
  function connect(...args: unknown[]): InternalTlsSocket {
    const values = args.slice();
    const callback = typeof values.at(-1) === "function" ? (values.pop() as () => void) : undefined;
    const first = values.shift();
    let options: ConnectionOptions;
    if (typeof first === "number") {
      const host = typeof values[0] === "string" ? (values.shift() as string) : undefined;
      options = { port: first, host, ...(values[0] as ConnectionOptions) };
    } else if (typeof first === "string") {
      options = { path: first, ...(values[0] as ConnectionOptions) };
    } else {
      options = first as ConnectionOptions;
    }
    const socket = new TLSSocket(undefined, options, undefined, true);
    if (callback) {
      socket.once("secureConnect", callback);
    }
    return socket.start(options);
  }

  const api = {
    CLIENT_RENEG_LIMIT: 3,
    CLIENT_RENEG_WINDOW: 600,
    DEFAULT_CIPHERS:
      "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES128-SHA256:ECDHE-ECDSA-AES256-SHA384:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA",
    DEFAULT_ECDH_CURVE: "auto",
    DEFAULT_MIN_VERSION: "TLSv1.2" as TLSVersion,
    DEFAULT_MAX_VERSION: "TLSv1.3" as TLSVersion,
    SecureContext,
    TLSSocket,
    Server,
    connect,
    convertALPNProtocols,
    createSecureContext: (options?: SecureContextOptions): SecureContext =>
      new SecureContext(options),
    createServer: (
      options?: ServerOptions | ((socket: TlsSocket) => void),
      listener?: (socket: TlsSocket) => void,
    ): TlsServer => new Server(options, listener),
    getCiphers: (): string[] => call(() => host.query("ciphers", encode([]))),
    getCertificateCompressionAlgorithms: (): string[] =>
      call(() => host.query("compression-algorithms", encode([]))),
    getCACertificates: (
      type: "default" | "bundled" | "system" | "extra" = "default",
    ): readonly string[] => {
      if (type === "bundled") {
        return api.rootCertificates;
      }
      let certs = caCache.get(type);
      if (!certs) {
        certs = Object.freeze(call<string[]>(() => host.query("ca-certificates", encode([type]))));
        caCache.set(type, certs);
      }
      return certs;
    },
    setDefaultCACertificates: (certs: Array<string | ArrayBufferView>): void => {
      hostCall(() => host.setDefaultCa(encode(certs)));
      caCache.delete("default");
    },
    checkServerIdentity: (hostname: string, cert: PeerCertificate): Error | undefined =>
      call(() => host.query("check-identity", encode([hostname, cert]))),
    rootCertificates: lazyCertificates(() =>
      call(() => host.query("ca-certificates", encode(["bundled"]))),
    ),
  };
  for (const name of ["CLIENT_RENEG_LIMIT", "CLIENT_RENEG_WINDOW"] as const) {
    const value = api[name];
    Object.defineProperty(api, name, {
      enumerable: true,
      get: () => value,
      set: () => unsupported(name, "renegotiation limits are host policy"),
    });
  }
  const tlsCallbacks: TlsCallbacks = {
    dispatch: (event) => listeners.get(event.target)?.(event.name, decode(event.value), event.data),
  };
  return { api, tlsCallbacks };
}

export type {
  TlsHost,
  TlsCallbacks,
  TlsStreamHost,
  TlsConfigurationProvider,
} from "./host-types.js";
