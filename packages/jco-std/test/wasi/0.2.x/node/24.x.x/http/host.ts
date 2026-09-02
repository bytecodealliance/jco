import nodeHttp from "node:http";

import { afterEach, describe, expect, test } from "vitest";

import {
  Server,
  request,
  setCallbacks,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http-host-node.js";
import type {
  DirectHttpResult,
  DirectHttpServerAddress,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";

const servers = new Set<nodeHttp.Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  servers.clear();
});

async function listen(server: nodeHttp.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  servers.add(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected a TCP listener");
  }
  return address.port;
}

describe("node:http direct Node host", () => {
  test("serves requests through the guest's exported callback", async () => {
    // The host reaches the guest through the callbacks the application connects after
    // instantiation, and names the listener by the id its server was created with.
    setCallbacks({
      handleRequest: async (listenerId, incoming) => ({
        statusCode: 202,
        statusMessage: "Accepted",
        headers: [{ name: "Content-Type", value: new TextEncoder().encode("text/plain") }],
        body: new TextEncoder().encode(
          `${listenerId} ${incoming.method} ${incoming.url} ${new TextDecoder().decode(incoming.body)}`,
        ),
      }),
    });
    const server = new Server({}, 7n);
    const started = (await server.listen({
      port: 0,
      host: "127.0.0.1",
    })) as DirectHttpResult<DirectHttpServerAddress>;
    expect(started.tag).toBe("ok");
    if (started.tag === "err" || started.val.tag !== "tcp") {
      throw new Error("expected a TCP listener");
    }
    const result = await request({
      method: "POST",
      scheme: "http",
      authority: `127.0.0.1:${started.val.val.port}`,
      pathWithQuery: "/resource",
      headers: [
        {
          name: "Host",
          value: new TextEncoder().encode(`127.0.0.1:${started.val.val.port}`),
        },
        { name: "Content-Length", value: new TextEncoder().encode("5") },
      ],
      body: new TextEncoder().encode("hello"),
    });
    expect(result.tag).toBe("ok");
    if (result.tag === "ok") {
      expect(result.val.statusCode).toBe(202);
      expect(new TextDecoder().decode(result.val.body)).toBe("7 POST /resource hello");
    }
    await server.close();
  });

  test("performs the guest-boundary-shaped request through real node:http", async () => {
    const server = nodeHttp.createServer((incoming, outgoing) => {
      const chunks: Uint8Array[] = [];
      incoming.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      incoming.on("end", () => {
        outgoing.setHeader("Set-Cookie", ["first=1", "second=2"]);
        outgoing.writeHead(202, "Accepted");
        outgoing.end(`received:${Buffer.concat(chunks).toString()}`);
      });
    });
    const port = await listen(server);
    const result = await request({
      method: "POST",
      scheme: "http",
      authority: `127.0.0.1:${port}`,
      pathWithQuery: "/submit",
      headers: [
        { name: "Host", value: new TextEncoder().encode(`127.0.0.1:${port}`) },
        { name: "Content-Type", value: new TextEncoder().encode("text/plain") },
        { name: "Content-Length", value: new TextEncoder().encode("5") },
      ],
      body: new TextEncoder().encode("hello"),
    });

    expect(result.tag).toBe("ok");
    if (result.tag === "ok") {
      expect(result.val.statusCode).toBe(202);
      expect(result.val.statusMessage).toBe("Accepted");
      expect(new TextDecoder().decode(result.val.body)).toBe("received:hello");
      expect(
        result.val.headers.filter(({ name }) => name.toLowerCase() === "set-cookie"),
      ).toHaveLength(2);
    }
  });

  test("serializes Node connection errors", async () => {
    const result = await request({
      method: "GET",
      scheme: "http",
      authority: "127.0.0.1:1",
      pathWithQuery: "/",
      headers: [],
      body: new Uint8Array(),
      connectTimeoutMs: 100,
    });
    expect(result).toMatchObject({ tag: "err", val: { code: "ECONNREFUSED" } });
  });

  test("enforces a first-byte deadline without blocking the Node event loop", async () => {
    const server = nodeHttp.createServer((_incoming, outgoing) => {
      setTimeout(() => outgoing.end("late"), 100);
    });
    const port = await listen(server);
    const result = await request({
      method: "GET",
      scheme: "http",
      authority: `127.0.0.1:${port}`,
      pathWithQuery: "/",
      headers: [{ name: "Host", value: new TextEncoder().encode(`127.0.0.1:${port}`) }],
      body: new Uint8Array(),
      firstByteTimeoutMs: 10,
    });
    expect(result).toMatchObject({ tag: "err", val: { code: "ETIMEDOUT", syscall: "request" } });
  });
});
