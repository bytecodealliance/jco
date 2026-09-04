import { readFileSync } from "node:fs";

import { afterEach, describe, expect, test } from "vitest";

import { Server, request } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http-host-node.js";
import type {
  DirectHttpRequestListener,
  DirectHttpServer,
  DirectHttpServerOptions,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FIXTURES = new URL("../../../../../../../preview2-shim/test/fixtures/tls/", import.meta.url);
const cert = new Uint8Array(readFileSync(new URL("localhost.crt", FIXTURES)));
const key = new Uint8Array(readFileSync(new URL("localhost.key", FIXTURES)));

const servers = new Set<DirectHttpServer>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => server.close()));
  servers.clear();
});

const echo: DirectHttpRequestListener = {
  handle: async (incoming) => ({
    tag: "ok",
    val: {
      statusCode: 200,
      statusMessage: "OK",
      headers: [{ name: "Content-Type", value: encoder.encode("text/plain") }],
      body: encoder.encode(`${incoming.method} ${incoming.url} ${decoder.decode(incoming.body)}`),
    },
  }),
  [Symbol.dispose]: () => undefined,
};

async function listen(
  options: DirectHttpServerOptions,
): Promise<{ server: DirectHttpServer; port: number }> {
  const server = new Server(options, echo);
  servers.add(server);
  const started = await server.listen({ port: 0, host: "127.0.0.1" });
  if (started.tag === "err" || started.val.tag !== "tcp") {
    throw new Error(`expected a TCP listener, got ${JSON.stringify(started)}`);
  }
  return { server, port: started.val.val.port };
}

describe("node:https direct Node host", () => {
  test("terminates TLS for a server carrying a tls record", async () => {
    const { port } = await listen({ tls: { key: [key], cert: [cert] } });
    const result = await request({
      method: "POST",
      scheme: "https",
      authority: `127.0.0.1:${port}`,
      pathWithQuery: "/secure",
      headers: [
        { name: "Host", value: encoder.encode(`127.0.0.1:${port}`) },
        { name: "Content-Length", value: encoder.encode("5") },
      ],
      body: encoder.encode("hello"),
      // The fixture certificate names `localhost`, so SNI carries that name while the
      // connection itself goes to the loopback address.
      tls: { ca: [cert], servername: "localhost" },
    });
    expect(result.tag).toBe("ok");
    if (result.tag === "ok") {
      expect(result.val.statusCode).toBe(200);
      expect(decoder.decode(result.val.body)).toBe("POST /secure hello");
    }
  });

  test("verifies the server certificate unless told not to", async () => {
    const { port } = await listen({ tls: { key: [key], cert: [cert] } });
    const base = {
      method: "GET",
      scheme: "https",
      authority: `127.0.0.1:${port}`,
      pathWithQuery: "/",
      headers: [{ name: "Host", value: encoder.encode(`127.0.0.1:${port}`) }],
      body: new Uint8Array(),
    };
    const untrusted = await request({ ...base, tls: { servername: "localhost" } });
    expect(untrusted.tag).toBe("err");
    if (untrusted.tag === "err") {
      expect(untrusted.val.code).toMatch(/SELF_SIGNED|DEPTH_ZERO/);
    }
    const unverified = await request({
      ...base,
      tls: { servername: "localhost", rejectUnauthorized: false },
    });
    expect(unverified).toMatchObject({ tag: "ok", val: { statusCode: 200 } });
  });

  test("builds an https server from an empty tls record and fails the handshake like Node", async () => {
    const { port } = await listen({ tls: {} });
    const result = await request({
      method: "GET",
      scheme: "https",
      authority: `127.0.0.1:${port}`,
      pathWithQuery: "/",
      headers: [{ name: "Host", value: encoder.encode(`127.0.0.1:${port}`) }],
      body: new Uint8Array(),
      tls: { rejectUnauthorized: false },
    });
    expect(result.tag).toBe("err");
  });

  test("keeps serving plaintext when no tls record is present", async () => {
    const { port } = await listen({});
    const result = await request({
      method: "GET",
      scheme: "http",
      authority: `127.0.0.1:${port}`,
      pathWithQuery: "/plain",
      headers: [{ name: "Host", value: encoder.encode(`127.0.0.1:${port}`) }],
      body: new Uint8Array(),
    });
    expect(result).toMatchObject({ tag: "ok", val: { statusCode: 200 } });
    if (result.tag === "ok") {
      expect(decoder.decode(result.val.body)).toBe("GET /plain ");
    }
  });
});
