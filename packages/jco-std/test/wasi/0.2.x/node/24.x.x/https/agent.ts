import nodeHttps from "node:https";

import { describe, expect, test } from "vitest";

import { Agent as HttpAgent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/agent.js";
import { Agent, globalAgent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/https/agent.js";
import { describeDifferential } from "../helpers/assert.js";

type NameOptions = Parameters<Agent["getName"]>[0];

/**
 * One case per `getName` field, plus the guards that decide whether a field contributes.
 * The order of the fields is what makes two option bags share or split a socket pool, so a
 * mismatch anywhere here is a real behavioural difference, not a cosmetic one.
 */
const NAME_CASES: Array<{ label: string; options?: NameOptions }> = [
  { label: "no arguments" },
  { label: "empty options", options: {} },
  { label: "host and port", options: { host: "example.com", port: 443 } },
  { label: "host only", options: { host: "example.com" } },
  { label: "local address", options: { host: "h", port: 443, localAddress: "1.2.3.4" } },
  { label: "family 4", options: { host: "h", port: 443, family: 4 } },
  { label: "family 6", options: { host: "h", port: 443, family: 6 } },
  { label: "socket path", options: { host: "h", port: 443, socketPath: "/tmp/s" } },
  { label: "family before the TLS fields", options: { host: "h", port: 443, family: 4, ca: "C" } },
  {
    label: "socket path before the TLS fields",
    options: { host: "h", port: 443, socketPath: "/tmp/s", ca: "C" },
  },
  { label: "ca", options: { host: "h", port: 443, ca: "CA" } },
  { label: "cert", options: { host: "h", port: 443, cert: "CERT" } },
  { label: "clientCertEngine", options: { host: "h", port: 443, clientCertEngine: "ENGINE" } },
  { label: "ciphers", options: { host: "h", port: 443, ciphers: "AES" } },
  { label: "key", options: { host: "h", port: 443, key: "KEY" } },
  { label: "pfx string", options: { host: "h", port: 443, pfx: "PFX" } },
  {
    label: "pfx array with passphrases",
    options: {
      host: "h",
      port: 443,
      pfx: [{ buf: "b1", passphrase: "p1" }, { buf: "b2" }],
      passphrase: "outer",
    } as NameOptions,
  },
  { label: "pfx array of plain values", options: { host: "h", port: 443, pfx: ["a", "b"] } },
  {
    label: "pfx array without any passphrase",
    options: { host: "h", port: 443, pfx: [{ buf: "b1" }, "b2"] } as NameOptions,
  },
  {
    label: "pfx array with empty buf and passphrase strings",
    options: {
      host: "h",
      port: 443,
      pfx: [{ buf: "", passphrase: "" }],
      passphrase: "outer",
    } as NameOptions,
  },
  {
    label: "pfx array holding null",
    options: { host: "h", port: 443, pfx: [null] } as NameOptions,
  },
  {
    label: "rejectUnauthorized false",
    options: { host: "h", port: 443, rejectUnauthorized: false },
  },
  { label: "rejectUnauthorized true", options: { host: "h", port: 443, rejectUnauthorized: true } },
  { label: "servername equal to host", options: { host: "h", port: 443, servername: "h" } },
  {
    label: "servername different from host",
    options: { host: "h", port: 443, servername: "other" },
  },
  { label: "minVersion", options: { host: "h", port: 443, minVersion: "TLSv1.2" } },
  { label: "maxVersion", options: { host: "h", port: 443, maxVersion: "TLSv1.3" } },
  { label: "secureProtocol", options: { host: "h", port: 443, secureProtocol: "TLS_method" } },
  { label: "crl", options: { host: "h", port: 443, crl: "CRL" } },
  { label: "honorCipherOrder false", options: { host: "h", port: 443, honorCipherOrder: false } },
  { label: "ecdhCurve", options: { host: "h", port: 443, ecdhCurve: "auto" } },
  { label: "dhparam", options: { host: "h", port: 443, dhparam: "DH" } },
  { label: "secureOptions zero", options: { host: "h", port: 443, secureOptions: 0 } },
  { label: "sessionIdContext", options: { host: "h", port: 443, sessionIdContext: "ctx" } },
  { label: "sigalgs string", options: { host: "h", port: 443, sigalgs: "ecdsa" } },
  { label: "sigalgs object", options: { host: "h", port: 443, sigalgs: { a: 1 } } },
  { label: "privateKeyIdentifier", options: { host: "h", port: 443, privateKeyIdentifier: "id" } },
  { label: "privateKeyEngine", options: { host: "h", port: 443, privateKeyEngine: "eng" } },
  {
    label: "every field at once",
    options: {
      host: "h",
      port: 8443,
      localAddress: "1.2.3.4",
      family: 6,
      ca: "CA",
      cert: "CERT",
      clientCertEngine: "ENGINE",
      ciphers: "AES",
      key: "KEY",
      pfx: "PFX",
      rejectUnauthorized: false,
      servername: "other",
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.3",
      secureProtocol: "TLS_method",
      crl: "CRL",
      honorCipherOrder: true,
      ecdhCurve: "auto",
      dhparam: "DH",
      secureOptions: 1,
      sessionIdContext: "ctx",
      sigalgs: ["a"],
      privateKeyIdentifier: "id",
      privateKeyEngine: "eng",
    },
  },
];

describe("https.Agent", () => {
  test.concurrent("keeps Node's option defaults", () => {
    const agent = new Agent();
    expect(agent.defaultPort).toBe(443);
    expect(agent.protocol).toBe("https:");
    expect(agent.maxCachedSessions).toBe(100);
    expect(agent.keepAlive).toBe(false);
  });

  test.concurrent("honours explicit defaultPort, protocol, and maxCachedSessions", () => {
    const agent = new Agent({ defaultPort: 8443, protocol: "http:", maxCachedSessions: 0 });
    expect(agent.defaultPort).toBe(8443);
    expect(agent.protocol).toBe("http:");
    expect(agent.maxCachedSessions).toBe(0);
  });

  test.concurrent("keeps the global agent's documented options", () => {
    expect(globalAgent.defaultPort).toBe(443);
    expect(globalAgent.protocol).toBe("https:");
    expect(globalAgent.keepAlive).toBe(true);
    expect(globalAgent.scheduling).toBe("lifo");
  });

  test.concurrent("refuses to own TLS connections", () => {
    expect(() => new Agent().createConnection()).toThrow(
      expect.objectContaining({
        code: "ERR_JCO_UNSUPPORTED_NODE_API",
        message: expect.stringContaining("https.Agent.createConnection"),
      }),
    );
  });

  test.concurrent("stores and evicts TLS sessions", () => {
    const agent = new Agent({ maxCachedSessions: 2 });
    agent._cacheSession("a", 1);
    agent._cacheSession("b", 2);
    expect(agent._getSession("a")).toBe(1);
    agent._cacheSession("c", 3);
    expect(agent._getSession("a")).toBeUndefined();
    expect(agent._sessionCache.list).toEqual(["b", "c"]);
    agent._cacheSession("b", 20);
    expect(agent._getSession("b")).toBe(20);
    expect(agent._sessionCache.list).toEqual(["b", "c"]);
    agent._evictSession("b");
    expect(agent._getSession("b")).toBeUndefined();
    expect(agent._sessionCache.list).toEqual(["c"]);
    agent._evictSession("missing");
    expect(agent._sessionCache.list).toEqual(["c"]);
  });

  test.concurrent("caches nothing when the cache is disabled", () => {
    const agent = new Agent({ maxCachedSessions: 0 });
    agent._cacheSession("a", 1);
    expect(agent._getSession("a")).toBeUndefined();
    expect(agent._sessionCache.list).toEqual([]);
  });

  test.concurrent("produces a 23-field key for a plain host and port", () => {
    expect(new Agent().getName({ host: "h", port: 443 }).split(":")).toHaveLength(23);
  });

  test.concurrent("keeps a supplied maxCachedSessions value as-is", () => {
    // Only an absent option falls back to 100 in lib/https.js.
    expect(new Agent({ maxCachedSessions: null as never }).maxCachedSessions).toBeNull();
    expect(new Agent({ maxCachedSessions: 7 }).maxCachedSessions).toBe(7);
  });
});

describeDifferential("https.Agent differential", () => {
  for (const { label, options } of NAME_CASES) {
    test.concurrent(`getName matches Node for ${label}`, () => {
      expect(new Agent().getName(options)).toBe(
        new nodeHttps.Agent().getName(options as Parameters<nodeHttps.Agent["getName"]>[0]),
      );
    });
  }

  test.concurrent("declares the same own prototype members as Node", () => {
    expect(Object.getOwnPropertyNames(Agent.prototype).sort()).toEqual(
      Object.getOwnPropertyNames(nodeHttps.Agent.prototype).sort(),
    );
    expect(Object.getPrototypeOf(Agent)).toBe(HttpAgent);
  });

  test.concurrent("matches Node's option defaults", () => {
    for (const options of [
      undefined,
      {},
      { maxCachedSessions: 5 },
      { maxCachedSessions: null as never },
      { defaultPort: 8443 },
      { protocol: "http:" },
      { keepAlive: true, scheduling: "lifo" as const },
    ]) {
      const portable = new Agent(options);
      const native = new nodeHttps.Agent(options);
      expect(portable.defaultPort).toBe(native.defaultPort);
      expect(portable.protocol).toBe(native.protocol);
      expect(portable.maxCachedSessions).toBe(native.maxCachedSessions);
      expect({ ...portable.options }).toEqual({ ...native.options });
    }
  });

  test.concurrent("matches Node's global agent defaults", () => {
    expect(globalAgent.defaultPort).toBe(nodeHttps.globalAgent.defaultPort);
    expect(globalAgent.protocol).toBe(nodeHttps.globalAgent.protocol);
    expect(globalAgent.maxCachedSessions).toBe(nodeHttps.globalAgent.maxCachedSessions);
    expect({ ...globalAgent.options }).toEqual({ ...nodeHttps.globalAgent.options });
  });
});
