import { describe, expect, test } from "vitest";

import { tlsMaterial } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/tls.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const API = "https.createServer option";

function text(value: Uint8Array | undefined): string | undefined {
  return value === undefined ? undefined : decoder.decode(value);
}

describe("node:https TLS option normalization", () => {
  test.concurrent("returns undefined when no carried option is present", () => {
    expect(tlsMaterial({}, API)).toBeUndefined();
    expect(tlsMaterial({ requestTimeout: 5 } as never, API)).toBeUndefined();
  });

  test.concurrent("encodes string material as UTF-8 and keeps every field a list", () => {
    const material = tlsMaterial({ key: "K", cert: "C", pfx: "P", ca: "A", crl: "R" }, API)!;
    expect(material.key!.map(text)).toEqual(["K"]);
    expect(material.cert!.map(text)).toEqual(["C"]);
    expect(material.pfx!.map(text)).toEqual(["P"]);
    expect(material.ca!.map(text)).toEqual(["A"]);
    expect(material.crl!.map(text)).toEqual(["R"]);
  });

  test.concurrent("preserves arrays entry by entry instead of joining them", () => {
    // OpenSSL reads only the first key out of a concatenated PEM, so a joined bundle would
    // silently lose the second key.
    const material = tlsMaterial({ key: ["rsa", "ecdsa"], cert: ["leaf", "chain"] }, API)!;
    expect(material.key!.map(text)).toEqual(["rsa", "ecdsa"]);
    expect(material.cert!.map(text)).toEqual(["leaf", "chain"]);
  });

  test.concurrent("copies binary material out of its source buffer", () => {
    const source = new Uint8Array([1, 2, 3, 4]);
    const view = new DataView(source.buffer, 1, 2);
    const material = tlsMaterial(
      { key: source, cert: view, pfx: source.buffer, dhparam: source.subarray(2) },
      API,
    )!;
    expect([...material.key![0]]).toEqual([1, 2, 3, 4]);
    expect([...material.cert![0]]).toEqual([2, 3]);
    expect([...material.pfx![0]]).toEqual([1, 2, 3, 4]);
    expect([...material.dhparam!]).toEqual([3, 4]);
    source.fill(0);
    expect([...material.key![0]]).toEqual([1, 2, 3, 4]);
  });

  test.concurrent("carries every scalar the record has a field for", () => {
    expect(
      tlsMaterial(
        {
          passphrase: "pw",
          ciphers: "AES",
          ecdhCurve: "auto",
          sigalgs: "ecdsa_secp256r1_sha256",
          minVersion: "TLSv1.2",
          maxVersion: "TLSv1.3",
          secureProtocol: "TLS_method",
          secureOptions: 4,
          sessionIdContext: "ctx",
          honorCipherOrder: true,
          servername: "example.com",
          rejectUnauthorized: false,
          requestCert: true,
        },
        API,
      ),
    ).toEqual({
      passphrase: "pw",
      ciphers: "AES",
      ecdhCurve: "auto",
      sigalgs: "ecdsa_secp256r1_sha256",
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.3",
      secureProtocol: "TLS_method",
      secureOptions: 4,
      sessionIdContext: "ctx",
      honorCipherOrder: true,
      servername: "example.com",
      rejectUnauthorized: false,
      requestCert: true,
    });
  });

  test.concurrent("accepts ALPN protocols as an array or in wire form", () => {
    expect(tlsMaterial({ ALPNProtocols: ["h2", "http/1.1"] }, API)).toEqual({
      alpnProtocols: ["h2", "http/1.1"],
    });
    const wire = new Uint8Array([2, ...encoder.encode("h2"), 8, ...encoder.encode("http/1.1")]);
    expect(tlsMaterial({ ALPNProtocols: wire }, API)).toEqual({
      alpnProtocols: ["h2", "http/1.1"],
    });
  });

  test.concurrent("rejects malformed ALPN input", () => {
    for (const value of [
      new Uint8Array([0]),
      new Uint8Array([5, 104]),
      [1],
      "h2",
      42,
    ] as unknown[]) {
      expect(() => tlsMaterial({ ALPNProtocols: value as never }, API)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
  });

  test.concurrent("validates scalar types the way Node's validators do", () => {
    for (const options of [
      { passphrase: 1 },
      { ciphers: ["AES"] },
      { minVersion: 1.2 },
      { honorCipherOrder: "yes" },
      { rejectUnauthorized: 0 },
      { requestCert: "true" },
      { secureOptions: "4" },
      { key: 42 },
      { ca: [null] },
      { dhparam: {} },
    ]) {
      expect(() => tlsMaterial(options as never, API)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
    for (const secureOptions of [-1, 1.5, 2 ** 32]) {
      expect(() => tlsMaterial({ secureOptions }, API)).toThrow(
        expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
      );
    }
  });

  test.concurrent("refuses per-entry passphrases rather than dropping them", () => {
    expect(() => tlsMaterial({ key: ["a", { pem: "b", passphrase: "p" }] } as never, API)).toThrow(
      expect.objectContaining({
        code: "ERR_JCO_UNSUPPORTED_NODE_API",
        message: expect.stringContaining(`${API} key[1]`),
      }),
    );
    expect(() => tlsMaterial({ pfx: [{ buf: "b", passphrase: "p" }] } as never, API)).toThrow(
      expect.objectContaining({ message: expect.stringContaining(`${API} pfx[0]`) }),
    );
  });

  test.concurrent("refuses every option that cannot cross the boundary, by name", () => {
    const refused = [
      "ALPNCallback",
      "SNICallback",
      "checkServerIdentity",
      "pskCallback",
      "secureContext",
      "session",
      "ticketKeys",
      "clientCertEngine",
      "privateKeyEngine",
      "privateKeyIdentifier",
    ];
    for (const name of refused) {
      expect(() => tlsMaterial({ key: "K", [name]: () => undefined } as never, API)).toThrow(
        expect.objectContaining({
          code: "ERR_JCO_UNSUPPORTED_NODE_API",
          message: expect.stringContaining(`${API} ${name}`),
        }),
      );
    }
    // The label is the caller's, so a client refusal names the request API.
    expect(() =>
      tlsMaterial({ checkServerIdentity: () => undefined } as never, "https.request option"),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("https.request option checkServerIdentity"),
      }),
    );
  });

  test.concurrent("checks for refused options before touching any material", () => {
    let read = false;
    const options = {
      SNICallback: () => undefined,
      get key(): string {
        read = true;
        return "K";
      },
    };
    expect(() => tlsMaterial(options as never, API)).toThrow();
    expect(read).toBe(false);
  });
});
