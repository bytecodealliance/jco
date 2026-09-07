import { tlsMaterial } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/tls.js";
import { expect, test } from "vitest";
import {
  authority,
  errorCode,
  createWasiSocketsHttpImplementation,
  type WasiInputStream,
  type WasiOutputStream,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/wasi-sockets/index.js";
import {
  handshake,
  validateTlsOptions,
  type WasiTlsProvider,
  type WasiTlsResult,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/wasi-sockets/tls.js";
import type { HttpTlsMaterial } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";
import * as denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls-host.js";

test.concurrent("HTTPS authority defaults to 443 and preserves explicit ports", () => {
  expect(authority("example.com", "https")).toEqual({ hostname: "example.com", port: 443 });
  expect(authority("example.com:8443", "https")).toEqual({ hostname: "example.com", port: 8443 });
  expect(authority("example.com")).toEqual({ hostname: "example.com", port: 80 });
});

test.concurrent("recognizes ComponentError payloads for socket polling and stream closure", () => {
  expect(errorCode(Object.assign(new Error("would-block"), { payload: "would-block" }))).toBe(
    "would-block",
  );
  expect(errorCode(Object.assign(new Error("closed"), { payload: { tag: "closed" } }))).toBe(
    "closed",
  );
  expect(errorCode(new Error("would-block"))).toBeUndefined();
});

const options: HttpTlsMaterial[] = [
  { ca: [] },
  { key: [] },
  { cert: [] },
  { pfx: [] },
  { passphrase: "x" },
  { crl: [] },
  { dhparam: new Uint8Array() },
  { ciphers: "x" },
  { ecdhCurve: "x" },
  { sigalgs: "x" },
  { minVersion: "TLSv1.2" },
  { maxVersion: "TLSv1.3" },
  { secureProtocol: "x" },
  { secureOptions: 0 },
  { sessionIdContext: "x" },
  { honorCipherOrder: true },
  { alpnProtocols: ["http/1.1"] },
  { rejectUnauthorized: false },
  { requestCert: false },
  { servername: "" },
];
test.concurrent.each(options)(
  "rejects an unexpressible TLS option %j",
  (option: HttpTlsMaterial) => {
    expect(() => validateTlsOptions(option)).toThrow(/wasi:tls/);
  },
);
test.concurrent("accepts servername and explicitly enabled verification", () => {
  expect(() =>
    validateTlsOptions({ servername: "localhost", rejectUnauthorized: true }),
  ).not.toThrow();
});

test.concurrent("polls a pending handshake and drops the poll before its future", () => {
  const events: string[] = [];
  let ready = false;
  const input = { blockingRead: (): Uint8Array => new Uint8Array() };
  const output = { blockingWriteAndFlush: (): void => {} };
  const connection = { closeOutput: (): void => {} };
  const provider: WasiTlsProvider = {
    isAvailable: () => true,
    ClientHandshake: class {
      constructor(name: string, incoming: WasiInputStream, outgoing: WasiOutputStream) {
        expect(name).toBe("localhost");
        expect(incoming).toBe(input);
        expect(outgoing).toBe(output);
      }
      static finish(): ReturnType<WasiTlsProvider["ClientHandshake"]["finish"]> {
        return {
          get: (): WasiTlsResult | undefined =>
            ready ? { tag: "ok", val: { tag: "ok", val: [connection, input, output] } } : undefined,
          subscribe: () => ({
            block: (): void => {
              ready = true;
            },
            [Symbol.dispose]: (): void => {
              events.push("poll");
            },
          }),
          [Symbol.dispose]: (): void => {
            events.push("future");
          },
        };
      }
    },
  };
  expect(handshake(provider, "localhost", input, output)).toEqual([connection, input, output]);
  expect(events).toEqual(["poll", "future"]);
});

test.concurrent("drops a failed handshake's IO error and future", () => {
  const events: string[] = [];
  const input = { blockingRead: (): Uint8Array => new Uint8Array() };
  const output = { blockingWriteAndFlush: (): void => {} };
  const provider: WasiTlsProvider = {
    isAvailable: () => true,
    ClientHandshake: class {
      static finish(): ReturnType<WasiTlsProvider["ClientHandshake"]["finish"]> {
        return {
          get: (): WasiTlsResult => ({
            tag: "ok",
            val: {
              tag: "err",
              val: {
                toDebugString: (): string => "untrusted certificate",
                [Symbol.dispose]: (): void => {
                  events.push("error");
                },
              },
            },
          }),
          subscribe: (): never => {
            throw new Error("unexpected poll");
          },
          [Symbol.dispose]: (): void => {
            events.push("future");
          },
        };
      }
    },
  };
  expect(() => handshake(provider, "localhost", input, output)).toThrow(/untrusted certificate/);
  expect(events).toEqual(["error", "future"]);
});

test.concurrent("default denial is lazy and refuses before acquiring TCP resources", () => {
  const implementation = createWasiSocketsHttpImplementation({
    tls: denied,
    instanceNetwork: {
      instanceNetwork: (): never => {
        throw new Error("network touched");
      },
    },
    ipNameLookup: {
      resolveAddresses: (): never => {
        throw new Error("DNS touched");
      },
    },
    tcpCreateSocket: {
      createTcpSocket: (): never => {
        throw new Error("TCP touched");
      },
    },
  });
  expect(() =>
    implementation.request({
      scheme: "https",
      method: "GET",
      authority: "example.com",
      pathWithQuery: "/",
      headers: [],
      body: new Uint8Array(),
    }),
  ).toThrow(expect.objectContaining({ code: "ERR_JCO_TLS_ADAPTER_REQUIRED" }));
});

test.concurrent.each([
  "allowPartialTrustChain",
  "enableTrace",
  "requestOCSP",
  "minDHSize",
  "handshakeTimeout",
  "sessionTimeout",
])("rejects uncarried TLS setting %s instead of dropping it", (name: string): void => {
  expect(() =>
    tlsMaterial({ servername: "localhost", ...{ [name]: true } }, "https.request option"),
  ).toThrow(name);
});
