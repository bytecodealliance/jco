import native from "node:tls";
import { expect, test } from "vitest";
import { createTls } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls/core.js";
import denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls/node-host.js";
import { createTlsHost } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls/host-node.js";
import { encode } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls/wire.js";

test.concurrent("exports the pinned Node TLS module surface without granting capabilities", () => {
  const { api } = createTls(denied);
  // Capture the pinned release; newer host majors may add exports of their own.
  expect(Object.keys(api).sort()).toEqual([
    "CLIENT_RENEG_LIMIT",
    "CLIENT_RENEG_WINDOW",
    "DEFAULT_CIPHERS",
    "DEFAULT_ECDH_CURVE",
    "DEFAULT_MAX_VERSION",
    "DEFAULT_MIN_VERSION",
    "SecureContext",
    "Server",
    "TLSSocket",
    "checkServerIdentity",
    "connect",
    "convertALPNProtocols",
    "createSecureContext",
    "createServer",
    "getCACertificates",
    "getCertificateCompressionAlgorithms",
    "getCiphers",
    "rootCertificates",
    "setDefaultCACertificates",
  ]);
  if (process.versions.node === "24.20.0") {
    expect(Object.keys(api).sort()).toEqual(Object.keys(native).sort());
  }
  expect(() => api.connect(443)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_TLS_ADAPTER_REQUIRED" }),
  );
  expect(() => api.createServer()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_TLS_ADAPTER_REQUIRED" }),
  );
  expect(() => api.createSecureContext()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_TLS_ADAPTER_REQUIRED" }),
  );
});

test.concurrent.each([
  [],
  ["h2", "http/1.1"],
  ["é"],
  Buffer.from([2, 104, 50]),
  new DataView(new Uint8Array([9, 1, 97, 9]).buffer, 1, 2),
  undefined,
])("ALPN conversion matches Node for %j", (input) => {
  const actual = {};
  const expected = {};
  createTls(denied).api.convertALPNProtocols(input, actual);
  Reflect.get(native, "convertALPNProtocols")(input, expected);
  expect(actual).toEqual(expected);
});

test.concurrent("ALPN checks encoded byte length and copies caller-owned bytes", () => {
  const { api } = createTls(denied);
  expect(() => api.convertALPNProtocols(["é".repeat(128)], {})).toThrow(
    expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
  );
  const input = Buffer.from([1, 97]);
  const output: { ALPNProtocols?: Uint8Array } = {};
  api.convertALPNProtocols(input, output);
  input.fill(0);
  expect(output.ALPNProtocols).toEqual(Buffer.from([1, 97]));
});

test.concurrent("native queries match Node and providers keep CA policy isolated", () => {
  const first = createTlsHost();
  const second = createTlsHost();
  try {
    const { api } = createTls(first);
    expect(api.getCiphers()).toEqual(native.getCiphers());
    expect([...api.rootCertificates]).toEqual(native.rootCertificates);
    expect(Object.isFrozen(api.rootCertificates)).toBe(true);
    expect(api.getCACertificates("bundled")).toBe(api.rootCertificates);
    expect(api.getCACertificates("bundled")).toEqual(native.getCACertificates("bundled"));
    const original = native.getCACertificates();
    api.setDefaultCACertificates([]);
    expect(api.getCACertificates()).toEqual([]);
    for (const ca of [undefined, null, ""]) {
      const context = first.createContext(encode({ ca }));
      expect(first.takeContextOptions(context).ca).toEqual([]);
    }
    expect(createTls(second).api.getCACertificates()).toEqual(original);
    expect(native.getCACertificates()).toEqual(original);
    expect(() => api.setDefaultCACertificates(["not a certificate"])).toThrow(
      expect.objectContaining({ code: "ERR_CRYPTO_OPERATION_FAILED" }),
    );
    expect(api.getCACertificates()).toEqual([]);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test.concurrent("an already-aborted connection never acquires a host socket", async () => {
  const controller = new AbortController();
  controller.abort("cancelled");
  const { api } = createTls(denied);
  const socket = api.connect({ port: 443, signal: controller.signal });
  const error = await new Promise<Error>((resolve) => socket.once("error", resolve));
  expect(error).toMatchObject({ name: "AbortError", code: "ABORT_ERR", cause: "cancelled" });
  expect(socket.destroyed).toBe(true);
});

test.concurrent("HTTP configuration handles are one-use and cannot cross provider instances", () => {
  const first = createTlsHost();
  const second = createTlsHost();
  try {
    const id = first.createContext(encode({ rejectUnauthorized: false }));
    second.createContext(encode({}));
    expect(() => second.takeContextOptions(id)).toThrow(/another TLS provider/);
    expect(first.takeContextOptions(id).rejectUnauthorized).toBe(false);
    expect(() => first.takeContextOptions(id)).toThrow(/released/);
    expect(first.resourceCounts().contexts).toBe(0);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test.concurrent.each(["pskCallback", "lookup", "socket", "SNICallback", "ALPNCallback"])(
  "rejects unsupported callback/native option %s before accessing a host",
  (name) => {
    expect(() => createTls(denied).api.connect({ port: 443, [name]: () => {} })).toThrow(
      /not supported|unsupported|cannot cross/,
    );
  },
);
