/**
 * Agent for the portable node:https shim.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/https.js (MIT license). The option defaults,
 * the TLS session cache, and the full `getName()` field order are kept verbatim; socket
 * pooling, TLS handshakes, and CONNECT proxy tunnelling are owned by the selected
 * implementation and refuse rather than pretend.
 */

import { Agent as HttpAgent, type AgentNameOptions, type AgentOptions } from "../http/agent.js";
import { unsupported } from "../http/errors.js";
import type { ProtocolProfile } from "../http/profile.js";

export interface HttpsAgentOptions extends AgentOptions {
  maxCachedSessions?: number;
  servername?: string;
}

/** `getName()` reads TLS options too, so its argument is wider than the http one. */
export interface HttpsAgentNameOptions extends AgentNameOptions {
  ca?: unknown;
  cert?: unknown;
  clientCertEngine?: unknown;
  ciphers?: unknown;
  key?: unknown;
  pfx?: unknown;
  passphrase?: unknown;
  rejectUnauthorized?: unknown;
  servername?: unknown;
  minVersion?: unknown;
  maxVersion?: unknown;
  secureProtocol?: unknown;
  crl?: unknown;
  honorCipherOrder?: unknown;
  ecdhCurve?: unknown;
  dhparam?: unknown;
  secureOptions?: unknown;
  sessionIdContext?: unknown;
  sigalgs?: unknown;
  privateKeyIdentifier?: unknown;
  privateKeyEngine?: unknown;
}

interface SessionCache {
  map: Record<string, unknown>;
  list: string[];
}

interface PfxEntry {
  buf?: unknown;
  passphrase?: unknown;
}

/**
 * Builds the `pfx` field of an agent key.
 *
 * Ported from `getPfxAgentKey` in lib/https.js: a plain value contributes itself, while an
 * array contributes `:buf:passphrase` per entry so distinct bundles get distinct keys. The
 * falsy (`||`) fallbacks and the literal `undefined` for a missing passphrase are Node's own.
 */
function pfxAgentKey(pfx: unknown, passphrase: unknown): string {
  if (!Array.isArray(pfx)) {
    return String(pfx);
  }
  let key = "";
  for (const value of pfx as Array<PfxEntry | null | undefined>) {
    const raw = value?.buf || value;
    const pass = value?.passphrase || passphrase;
    key += `:${String(raw)}:${String(pass)}`;
  }
  return key;
}

export class Agent extends HttpAgent {
  maxCachedSessions: number;
  readonly _sessionCache: SessionCache;

  constructor(options: HttpsAgentOptions = {}) {
    super({
      ...options,
      defaultPort: options.defaultPort ?? 443,
      protocol: options.protocol ?? "https:",
    });
    // lib/https.js: only an absent option falls back to 100; any supplied value is kept as-is.
    const configured = this.options.maxCachedSessions;
    this.maxCachedSessions = configured === undefined ? 100 : (configured as number);
    this._sessionCache = { map: {}, list: [] };
  }

  override createConnection(..._args: unknown[]): never {
    return unsupported(
      "https.Agent.createConnection",
      "TLS handshakes and CONNECT tunnels are owned by the selected implementation",
    );
  }

  /**
   * Own prototype member in Node so a per-request `checkServerIdentity` socket is never
   * pooled; the shim has no sockets, so it only preserves the shape and defers to the base.
   */
  override keepSocketAlive(socket: unknown): boolean {
    return super.keepSocketAlive(socket);
  }

  /**
   * Appends the 19 TLS fields to the http agent key.
   *
   * The order, the `!== undefined` guards on `rejectUnauthorized`, `honorCipherOrder`, and
   * `secureOptions`, the `servername !== host` guard, and the `JSON.stringify` of `sigalgs`
   * are all load-bearing: they are what makes two option bags share or split a socket pool.
   */
  override getName(options: HttpsAgentNameOptions = {}): string {
    let name = super.getName(options);

    name += ":";
    if (options.ca) {
      name += options.ca;
    }

    name += ":";
    if (options.cert) {
      name += options.cert;
    }

    name += ":";
    if (options.clientCertEngine) {
      name += options.clientCertEngine;
    }

    name += ":";
    if (options.ciphers) {
      name += options.ciphers;
    }

    name += ":";
    if (options.key) {
      name += options.key;
    }

    name += ":";
    if (options.pfx) {
      name += pfxAgentKey(options.pfx, options.passphrase);
    }

    name += ":";
    if (options.rejectUnauthorized !== undefined) {
      name += options.rejectUnauthorized;
    }

    name += ":";
    if (options.servername && options.servername !== options.host) {
      name += options.servername;
    }

    name += ":";
    if (options.minVersion) {
      name += options.minVersion;
    }

    name += ":";
    if (options.maxVersion) {
      name += options.maxVersion;
    }

    name += ":";
    if (options.secureProtocol) {
      name += options.secureProtocol;
    }

    name += ":";
    if (options.crl) {
      name += options.crl;
    }

    name += ":";
    if (options.honorCipherOrder !== undefined) {
      name += options.honorCipherOrder;
    }

    name += ":";
    if (options.ecdhCurve) {
      name += options.ecdhCurve;
    }

    name += ":";
    if (options.dhparam) {
      name += options.dhparam;
    }

    name += ":";
    if (options.secureOptions !== undefined) {
      name += options.secureOptions;
    }

    name += ":";
    if (options.sessionIdContext) {
      name += options.sessionIdContext;
    }

    name += ":";
    if (options.sigalgs) {
      name += JSON.stringify(options.sigalgs);
    }

    name += ":";
    if (options.privateKeyIdentifier) {
      name += options.privateKeyIdentifier;
    }

    name += ":";
    if (options.privateKeyEngine) {
      name += options.privateKeyEngine;
    }

    return name;
  }

  _getSession(key: string): unknown {
    return this._sessionCache.map[key];
  }

  _cacheSession(key: string, session: unknown): void {
    if (this.maxCachedSessions === 0) {
      return;
    }
    if (this._sessionCache.map[key]) {
      this._sessionCache.map[key] = session;
      return;
    }
    if (this._sessionCache.list.length >= this.maxCachedSessions) {
      const oldKey = this._sessionCache.list.shift();
      if (oldKey !== undefined) {
        delete this._sessionCache.map[oldKey];
      }
    }
    this._sessionCache.list.push(key);
    this._sessionCache.map[key] = session;
  }

  _evictSession(key: string): void {
    const index = this._sessionCache.list.indexOf(key);
    if (index === -1) {
      return;
    }
    this._sessionCache.list.splice(index, 1);
    delete this._sessionCache.map[key];
  }
}

export const globalAgent = new Agent({ keepAlive: true, scheduling: "lifo", timeout: 5_000 });

export const HTTPS_PROFILE: ProtocolProfile = {
  module: "https",
  protocol: "https:",
  scheme: "https",
  defaultPort: 443,
  globalAgent,
};
