import type { ConnectionOptions as GuestConnectionOptions, ServerOptions } from "./types.js";
/** Opt-in native TLS provider. Every factory owns its handles, callbacks, and default CA policy. */
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import type { Socket } from "node:net";
import denied from "./node-host.js";
import { createWasiTlsBridge } from "./wasi.js";
import type { WasiTlsProvider } from "../http/impl/wasi-sockets/tls.js";
import type { ConnectionOptions, TlsOptions } from "node:tls";
import { encode, decode } from "./wire.js";
import type { TlsCallbacks, TlsEvent, TlsHost, TlsConfigurationProvider } from "./host-types.js";

export interface NodeTlsProvider extends TlsHost, TlsConfigurationProvider {
  attachCallbacks(callbacks: TlsCallbacks): void;
  dispose(): void;
  resourceCounts(): { sockets: number; servers: number; contexts: number };
}

// Keep configuration handles distinct across provider instances in this host realm.
let nextContext = 1;

export function createTlsHost(
  config: { wasiTls?: WasiTlsProvider; onCallbackError?: (error: unknown) => void } = {},
): NodeTlsProvider {
  const streamHost = config.wasiTls ? createWasiTlsBridge(config.wasiTls) : denied;
  const onCallbackError = config.onCallbackError;
  const sockets = new Map<number, tls.TLSSocket>();
  const handshaking = new Set<Socket>();
  const servers = new Map<number, tls.Server>();
  const contexts = new Map<number, tls.SecureContext>();
  const configurations = new Map<number, ConnectionOptions & TlsOptions>();
  let nextAccepted = 0x7fffffff;
  let defaultCa: string[] | undefined;
  let callbacks: TlsCallbacks | undefined;
  const queue: TlsEvent[] = [];
  let scheduled = false;
  let disposed = false;

  function send(target: number, name: string, value?: unknown, data = new Uint8Array()): void {
    if (disposed) {
      return;
    }
    queue.push({ target, name, value: encode(value), data });
    schedule();
  }

  function schedule(): void {
    if (scheduled || !callbacks || disposed) {
      return;
    }
    scheduled = true;
    setImmediate(async () => {
      try {
        while (queue.length && callbacks && !disposed) {
          await callbacks.dispatch(queue.shift()!);
        }
      } catch (error) {
        provider.dispose();
        // A guest trap cannot safely leave native listeners running.
        onCallbackError?.(error);
      } finally {
        scheduled = false;
        if (queue.length) {
          schedule();
        }
      }
    });
  }

  function invoke<T>(operation: () => T): T {
    try {
      if (disposed) {
        throw Object.assign(new Error("TLS provider is disposed"), {
          code: "ERR_JCO_TLS_PROVIDER_CLOSED",
        });
      }
      return operation();
    } catch (error) {
      const value = error as Error & { code?: string };
      throw {
        name: value.name ?? "Error",
        message: value.message ?? String(error),
        code: value.code,
      };
    }
  }

  function socket(id: number): tls.TLSSocket {
    const value = sockets.get(id);
    if (!value) {
      throw Object.assign(new Error("TLS socket is closed or unknown"), {
        code: "ERR_SOCKET_CLOSED",
      });
    }
    return value;
  }

  function context(id: number): tls.SecureContext {
    const value = contexts.get(id);
    if (!value) {
      throw new TypeError("SecureContext belongs to another TLS provider or has been released");
    }
    return value;
  }

  function options(text: string): ConnectionOptions & TlsOptions {
    const value = decode(text) as ConnectionOptions &
      TlsOptions & { contextId?: number; customIdentity?: boolean };
    if (value.contextId !== undefined) {
      value.secureContext = context(value.contextId);
    }
    if (!value.ca && defaultCa !== undefined) {
      value.ca = defaultCa;
    }
    // Trust-chain validation stays native. The guest checks its custom hostname/pinning policy
    // before the host is allowed to resume application data.
    if (value.customIdentity) {
      value.checkServerIdentity = () => undefined;
    }
    return value;
  }

  function state(value: tls.TLSSocket): object {
    return {
      authorized: value.authorized,
      authorizationError: value.authorizationError,
      alpnProtocol: value.alpnProtocol,
      servername: value.servername,
      localAddress: value.localAddress,
      localPort: value.localPort,
      localFamily: value.localFamily,
      remoteAddress: value.remoteAddress,
      remotePort: value.remotePort,
      remoteFamily: value.remoteFamily,
      bytesRead: value.bytesRead,
      bytesWritten: value.bytesWritten,
      connecting: value.connecting,
      pending: value.pending,
    };
  }

  function track(id: number, value: tls.TLSSocket): void {
    sockets.set(id, value);
    value.on("data", (data: Buffer) => {
      value.pause();
      send(id, "data", undefined, new Uint8Array(data));
    });
    value.pause();
    value.on("end", () => send(id, "end"));
    value.on("error", (error) => send(id, "error", error));
    value.on("close", (hadError) => send(id, "close", hadError));
    value.on("timeout", () => send(id, "timeout"));
    value.on("session", (data: Buffer) => send(id, "session", undefined, new Uint8Array(data)));
    value.on("keylog", (data: Buffer) => send(id, "keylog", undefined, new Uint8Array(data)));
    value.on("OCSPResponse", (data: Buffer | null) => send(id, "OCSPResponse", data));
    value.on("secureConnect", () => send(id, "secureConnect", state(value)));
    value.on("connect", () => send(id, "connect"));
  }

  const provider: NodeTlsProvider = {
    isAvailable: streamHost.isAvailable,
    startTls: streamHost.startTls,
    attachCallbacks(value) {
      callbacks = value;
      schedule();
    },
    query(operation, text) {
      return invoke(() => {
        const args = decode(text) as unknown[];
        switch (operation) {
          case "ciphers":
            return encode(tls.getCiphers());
          case "compression-algorithms":
            return encode(
              (
                tls as typeof tls & { getCertificateCompressionAlgorithms(): string[] }
              ).getCertificateCompressionAlgorithms(),
            );
          case "ca-certificates":
            return encode(
              args[0] === "default" && defaultCa
                ? defaultCa
                : tls.getCACertificates(args[0] as "default"),
            );
          case "check-identity":
            return encode(
              tls.checkServerIdentity(args[0] as string, args[1] as tls.PeerCertificate),
            );
        }
      });
    },
    setDefaultCa(text) {
      invoke(() => {
        const certs = decode(text);
        if (!Array.isArray(certs)) {
          throw Object.assign(new TypeError("certs must be an array"), {
            code: "ERR_INVALID_ARG_TYPE",
          });
        }
        const ca = certs.map((cert: unknown) => {
          if (typeof cert === "string") {
            return cert;
          }
          if (ArrayBuffer.isView(cert)) {
            return Buffer.from(cert.buffer, cert.byteOffset, cert.byteLength).toString();
          }
          throw Object.assign(new TypeError("certs entries must be strings or ArrayBuffer views"), {
            code: "ERR_INVALID_ARG_TYPE",
          });
        });
        const valid = new Set<string>();
        for (const text of ca) {
          for (const pem of text.match(
            /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
          ) ?? []) {
            try {
              valid.add(new X509Certificate(pem).toString());
            } catch {
              /* Node's trust store ignores invalid individual certificates. */
            }
          }
        }
        if (ca.length && !valid.size) {
          throw Object.assign(new Error("No valid certificates found in the provided array"), {
            code: "ERR_CRYPTO_OPERATION_FAILED",
          });
        }
        defaultCa = [...valid];
      });
    },
    createContext(text) {
      return invoke(() => {
        const config = options(text);
        const value = tls.createSecureContext(config);
        if (nextContext > 0x7fffffff) {
          throw new Error("TLS context handle space exhausted");
        }
        const id = nextContext++;
        contexts.set(id, value);
        configurations.set(id, config);
        return id;
      });
    },
    releaseContext(id) {
      contexts.delete(id);
      configurations.delete(id);
    },
    takeContextOptions(id) {
      context(id);
      const config = configurations.get(id)!;
      provider.releaseContext(id);
      return config as GuestConnectionOptions & ServerOptions;
    },
    connect(id, text) {
      invoke(() => {
        if (sockets.has(id)) {
          throw new Error("TLS socket id already exists");
        }
        const value = tls.connect(Object.assign(options(text), { allowHalfOpen: true }));
        track(id, value);
      });
    },
    createServer(id, text) {
      invoke(() => {
        if (servers.has(id)) {
          throw new Error("TLS server id already exists");
        }
        const value = tls.createServer({ ...options(text), allowHalfOpen: true });
        servers.set(id, value);
        value.on("connection", (raw) => {
          handshaking.add(raw);
          raw.once("close", () => handshaking.delete(raw));
        });
        value.on("secureConnection", (accepted) => {
          const socketId = nextAccepted--;
          track(socketId, accepted);
          send(id, "secureConnection", { id: socketId, state: state(accepted) });
        });
        value.on("tlsClientError", (error, failed) => {
          const socketId = nextAccepted--;
          track(socketId, failed);
          send(id, "tlsClientError", { error, socket: { id: socketId, state: state(failed) } });
        });
        value.on("error", (error) => send(id, "error", error));
        value.on("close", () => send(id, "close"));
        value.on("listening", () => send(id, "listening", value.address()));
        value.on("drop", (info) => send(id, "drop", info));
      });
    },
    socketOperation(id, operation, text) {
      return invoke(() => {
        const value = socket(id);
        const args = decode(text) as unknown[];
        let result: unknown;
        switch (operation) {
          case "state":
            result = state(value);
            break;
          case "address":
            result = value.address();
            break;
          case "certificate":
            result = value.getCertificate();
            break;
          case "peer-certificate":
            result = value.getPeerCertificate(args[0] as true);
            break;
          case "cipher":
            result = value.getCipher();
            break;
          case "ephemeral-key-info":
            result = value.getEphemeralKeyInfo();
            break;
          case "finished":
            result = value.getFinished();
            break;
          case "peer-finished":
            result = value.getPeerFinished();
            break;
          case "protocol":
            result = value.getProtocol();
            break;
          case "set-session":
            (value as tls.TLSSocket & { setSession(session: Buffer | string): void }).setSession(
              args[0] as Buffer | string,
            );
            break;
          case "set-servername":
            (value as tls.TLSSocket & { setServername(name: string): void }).setServername(
              args[0] as string,
            );
            break;
          case "session":
            result = value.getSession();
            break;
          case "shared-sigalgs":
            result = value.getSharedSigalgs();
            break;
          case "tls-ticket":
            result = value.getTLSTicket();
            break;
          case "session-reused":
            result = value.isSessionReused();
            break;
          case "export-keying-material":
            result = value.exportKeyingMaterial(
              args[0] as number,
              args[1] as string,
              args[2] as Buffer,
            );
            break;
          case "disable-renegotiation":
            value.disableRenegotiation();
            break;
          case "enable-trace":
            value.enableTrace();
            break;
          case "max-send-fragment":
            result = value.setMaxSendFragment(args[0] as number);
            break;
          case "key-cert":
            value.setKeyCert(
              typeof args[0] === "number" ? context(args[0]) : options(encode(args[0])),
            );
            break;
          case "timeout":
            value.setTimeout(args[0] as number);
            break;
          case "no-delay":
            value.setNoDelay(args[0] as boolean);
            break;
          case "keep-alive":
            value.setKeepAlive(args[0] as boolean, args[1] as number);
            break;
          case "ref":
            value.ref();
            break;
          case "unref":
            value.unref();
            break;
          case "resume":
            value.resume();
            break;
          case "pause":
            value.pause();
            break;
          case "destroy":
            value.destroy();
            break;
          case "renegotiate":
            result = value.renegotiate(args[0] as tls.TlsOptions, (error) =>
              send(id, "renegotiate", { token: args[1], error }),
            );
            break;
        }
        return encode(result);
      });
    },
    serverOperation(id, operation, text) {
      return invoke(() => {
        const value = servers.get(id);
        if (!value) {
          throw new Error("TLS server is closed or unknown");
        }
        const args = decode(text) as unknown[];
        let result: unknown;
        switch (operation) {
          case "state":
            result = {
              listening: value.listening,
              maxConnections: value.maxConnections,
              dropMaxConnection: Reflect.get(value, "dropMaxConnection"),
            };
            break;
          case "address":
            result = value.address();
            break;
          case "listen":
            value.listen(args[0] as { port: number; host?: string });
            break;
          case "close":
            value.close((error) => send(id, "close-complete", { token: args[0], error }));
            break;
          case "connections":
            value.getConnections((error, count) =>
              send(id, "connections", { token: args[0], error, count }),
            );
            break;
          case "ref":
            value.ref();
            break;
          case "unref":
            value.unref();
            break;
          case "ticket-keys":
            result = value.getTicketKeys();
            break;
          case "max-connections":
            Reflect.set(value, "maxConnections", args[0]);
            break;
          case "drop-max-connection":
            Reflect.set(value, "dropMaxConnection", args[0]);
            break;
          case "set-ticket-keys":
            value.setTicketKeys(args[0] as Buffer);
            break;
          case "secure-context":
            value.setSecureContext(options(encode(args[0])));
            break;
          case "add-context":
            value.addContext(
              args[0] as string,
              typeof args[1] === "number" ? context(args[1]) : options(encode(args[1])),
            );
            break;
        }
        return encode(result);
      });
    },
    write(id, token, data) {
      invoke(() => {
        socket(id).write(data, (error) => send(id, "write", { token, error }));
      });
    },
    end(id, token) {
      invoke(() => {
        socket(id).end(() => send(id, "write", { token }));
      });
    },
    release(id) {
      const value = sockets.get(id);
      if (value) {
        value.destroy();
        sockets.delete(id);
      }
    },
    resourceCounts() {
      return { sockets: sockets.size, servers: servers.size, contexts: contexts.size };
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      for (const socket of sockets.values()) {
        socket.destroy();
      }
      for (const socket of handshaking) {
        socket.destroy();
      }
      handshaking.clear();
      for (const server of servers.values()) {
        server.close();
      }
      sockets.clear();
      servers.clear();
      contexts.clear();
      configurations.clear();
      callbacks = undefined;
    },
  };
  return provider;
}

const provider = createTlsHost();
export const {
  isAvailable,
  startTls,
  query,
  setDefaultCa,
  createContext,
  releaseContext,
  connect,
  createServer,
  socketOperation,
  serverOperation,
  write,
  end,
  release,
  attachCallbacks,
  dispose,
} = provider;
export default provider;
