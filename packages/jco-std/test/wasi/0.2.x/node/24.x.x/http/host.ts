import nodeHttp from "node:http";

import { afterEach, describe, expect, test } from "vitest";

import {
  createHttpHost,
  request,
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
  test("serves requests through an instance-bound guest callback dispatcher", async () => {
    const { Server } = createHttpHost(() => ({
      handle: async (listener, incoming) => {
        expect(listener).toBe(1);
        return {
          statusCode: 202,
          statusMessage: "Accepted",
          headers: [{ name: "Content-Type", value: new TextEncoder().encode("text/plain") }],
          body: new TextEncoder().encode(
            `${incoming.method} ${incoming.url} ${new TextDecoder().decode(incoming.body)}`,
          ),
        };
      },
    }));
    const server = new Server({}, 1);
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
      expect(new TextDecoder().decode(result.val.body)).toBe("POST /resource hello");
    }
    await server.close();
  });

  test("serializes callbacks, recovers from WIT errors, and drains callbacks after sockets close", async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { Server } = createHttpHost(() => ({
      async handle(id, incoming) {
        expect(id).toBe(7);
        active++;
        peak = Math.max(peak, active);
        calls++;
        try {
          if (incoming.url === "/error") {
            throw Object.assign(new Error("component error"), {
              payload: { name: "Error", message: "guest failed", code: "EIO" },
            });
          }
          if (incoming.url === "/wait") {
            enter();
            await gate;
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
          return {
            statusCode: 200,
            statusMessage: "OK",
            headers: [],
            body: new TextEncoder().encode(incoming.url),
          };
        } finally {
          active--;
        }
      },
    }));
    const server = new Server({}, 7);
    try {
      const address = (await server.listen({
        port: 0,
        host: "127.0.0.1",
      })) as DirectHttpResult<DirectHttpServerAddress>;
      if (address.tag !== "ok" || address.val.tag !== "tcp") {
        throw new Error("expected TCP address");
      }
      const authority = `127.0.0.1:${address.val.val.port}`;
      const send = (pathWithQuery: string) =>
        request({
          method: "GET",
          scheme: "http",
          authority,
          pathWithQuery,
          headers: [{ name: "Host", value: new TextEncoder().encode(authority) }],
          body: new Uint8Array(),
        });
      const results = await Promise.all([send("/error"), send("/one"), send("/two")]);
      expect(results[0]).toMatchObject({
        tag: "ok",
        val: {
          statusCode: 500,
          body: new TextEncoder().encode("guest failed"),
        },
      });
      expect(results.slice(1)).toMatchObject([
        { tag: "ok", val: { statusCode: 200 } },
        { tag: "ok", val: { statusCode: 200 } },
      ]);
      expect(calls).toBe(3);
      expect(peak).toBe(1);
      const waiting = send("/wait");
      await entered;
      server.closeAllConnections();
      let closed = false;
      const closing = Promise.resolve(server.close()).then((result) => {
        closed = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(closed).toBe(false);
      release();
      expect(await closing).toEqual({ tag: "ok", val: true });
      await waiting;
      expect(active).toBe(0);
      expect(calls).toBe(4);
    } finally {
      release();
      server.closeAllConnections();
      await server.close();
      server[Symbol.dispose]();
    }
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
