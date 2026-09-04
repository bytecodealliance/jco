import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { createHttp } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import { servingImplementation } from "./helpers/index.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FIXTURES = new URL("../../../../../../../preview2-shim/test/fixtures/tls/", import.meta.url);
const cert = readFileSync(new URL("localhost.crt", FIXTURES));
const key = readFileSync(new URL("localhost.key", FIXTURES));

describe("node:https Server", () => {
  test("hands normalized TLS material to the implementation", () => {
    const { https, options } = servingImplementation();
    https.createServer({ key, cert, passphrase: "pw", ALPNProtocols: ["http/1.1"] });
    expect(options).toHaveLength(1);
    expect(options[0].tls).toEqual({
      key: [new Uint8Array(key)],
      cert: [new Uint8Array(cert)],
      passphrase: "pw",
      alpnProtocols: ["http/1.1"],
    });
    // The HTTP-level half of the bag still reaches the implementation untouched.
    expect(options[0].passphrase).toBe("pw");
  });

  test("keeps key, cert, and ca arrays as lists", () => {
    const { https, options } = servingImplementation();
    https.createServer({ key: [key, "second"], cert: [cert], ca: ["a", "b"] });
    expect(options[0].tls!.key!.map((entry) => decoder.decode(entry))).toEqual([
      key.toString(),
      "second",
    ]);
    expect(options[0].tls!.ca!.map((entry) => decoder.decode(entry))).toEqual(["a", "b"]);
  });

  test("always carries a TLS record, even when no TLS option was supplied", () => {
    // Node constructs an https.Server without a certificate and fails each handshake; the
    // record's presence is what tells an implementation without a TLS stack to refuse.
    const { https, options } = servingImplementation();
    https.createServer();
    https.createServer(() => undefined);
    https.createServer({ requestTimeout: 1_000 });
    expect(options.map(({ tls }) => tls)).toEqual([{}, {}, {}]);
    expect(options[2].requestTimeout).toBe(1_000);
  });

  test("passes no TLS record for a node:http server, whatever the bag contains", () => {
    const { implementation, options } = servingImplementation();
    createHttp(implementation).createServer({ key, cert });
    expect(options[0].tls).toBeUndefined();
    expect(options[0].key).toBe(key);
  });

  test("refuses unrepresentable TLS options by name before creating the server", () => {
    const { https, options } = servingImplementation();
    for (const [name, value] of [
      ["SNICallback", () => undefined],
      ["ALPNCallback", () => undefined],
      ["secureContext", {}],
      ["ticketKeys", new Uint8Array(48)],
    ] as const) {
      expect(() => https.createServer({ key, cert, [name]: value })).toThrow(
        expect.objectContaining({
          code: "ERR_JCO_UNSUPPORTED_NODE_API",
          message: expect.stringContaining(`https.createServer option ${name}`),
        }),
      );
    }
    expect(options).toHaveLength(0);
  });

  test("labels HTTP-level refusals as https", () => {
    const { https } = servingImplementation();
    expect(() => https.createServer({ insecureHTTPParser: true })).toThrow(
      expect.objectContaining({
        code: "ERR_JCO_UNSUPPORTED_NODE_API",
        message: expect.stringContaining("https.Server option insecureHTTPParser"),
      }),
    );
    const server = https.createServer({ key, cert });
    expect(() => server.listen({ port: 0, signal: new AbortController().signal })).toThrow(
      expect.objectContaining({ message: expect.stringContaining("https.Server.listen signal") }),
    );
  });

  test("rejects a non-object options argument the way Node does", () => {
    const { https } = servingImplementation();
    expect(() => https.createServer("8443" as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });

  test("dispatches inbound requests through the implementation", async () => {
    const { https, request } = servingImplementation();
    const server = https.createServer({ key, cert }, async (incoming, outgoing) => {
      let body = "";
      incoming.setEncoding("utf8");
      for await (const chunk of incoming) {
        body += chunk;
      }
      outgoing.writeHead(201, "Created", { "X-Method": incoming.method! });
      outgoing.end(`${incoming.url}:${body}`);
    });
    server.listen(8443, "127.0.0.1");
    await Promise.resolve();
    expect(server.listening).toBe(true);
    expect(server.address()).toEqual({ address: "127.0.0.1", family: "IPv4", port: 8443 });
    const response = await request({
      method: "POST",
      url: "/items",
      httpVersion: "1.1",
      headers: [{ name: "Content-Type", value: encoder.encode("text/plain") }],
      body: encoder.encode("hello"),
    });
    expect(response).toMatchObject({ statusCode: 201, statusMessage: "Created" });
    expect(decoder.decode(response.body)).toBe("/items:hello");
    server.close();
  });
});
