import { readFile } from "node:fs/promises";
import * as nodeHttp2 from "node:http2";

import { afterEach, describe, expect, test } from "vitest";

import {
  ClientSession,
  Server,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2-host-node.js";
import type {
  DirectHttp2ClientSession,
  DirectHttp2Server,
  DirectHttp2ServerErrorListener,
  DirectHttp2StreamListener,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const emptySettings = { customSettings: [] };
const closeables: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeables.splice(0).map((close) => close()));
});

async function nativeRequest(authority: string, secure = false): Promise<string> {
  const session = nodeHttp2.connect(authority, secure ? { rejectUnauthorized: false } : undefined);
  closeables.push(() => session.destroy());
  return new Promise((resolve, reject) => {
    const stream = session.request({ ":method": "POST", ":path": "/host-server" });
    const chunks: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(chunks.map((chunk) => decoder.decode(chunk)).join("")));
    stream.end("request");
  });
}

describe("Node HTTP/2 host provider", () => {
  test("uses a real h2c client session and stream", async () => {
    const server = nodeHttp2.createServer();
    closeables.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    server.on("stream", (stream) => {
      stream.respond({ ":status": 201, "content-type": "text/plain" });
      stream.end("real response");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("missing address");
    }

    const session = new ClientSession(`http://127.0.0.1:${address.port}`, {
      settings: emptySettings,
    }) as DirectHttp2ClientSession;
    closeables.push(() => session[Symbol.dispose]());
    await expect(session.ready()).resolves.toMatchObject({
      tag: "ok",
      val: { alpnProtocol: "h2c", encrypted: false },
    });
    const streamResult = session.request(
      [
        { name: ":method", value: encoder.encode("POST") },
        { name: ":path", value: encoder.encode("/") },
      ],
      {},
    );
    expect(streamResult.tag).toBe("ok");
    if (streamResult.tag === "err") {
      return;
    }
    streamResult.val.write(encoder.encode("body"));
    const response = await streamResult.val.finish();
    expect(response).toMatchObject({ tag: "ok" });
    if (response.tag === "ok") {
      expect(decoder.decode(response.val.body)).toBe("real response");
    }
  });

  test("uses a real TLS client session with h2 ALPN", async () => {
    const [key, cert] = await Promise.all([
      readFile(
        new URL(
          "../../../../../../../preview2-shim/test/fixtures/tls/localhost.key",
          import.meta.url,
        ),
      ),
      readFile(
        new URL(
          "../../../../../../../preview2-shim/test/fixtures/tls/localhost.crt",
          import.meta.url,
        ),
      ),
    ]);
    const server = nodeHttp2.createSecureServer({ key, cert });
    closeables.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    server.on("stream", (stream) => {
      stream.respond({ ":status": 200 });
      stream.end("secure response");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("missing address");
    }

    const session = new ClientSession(`https://127.0.0.1:${address.port}`, {
      settings: emptySettings,
      rejectUnauthorized: false,
    }) as DirectHttp2ClientSession;
    closeables.push(() => session[Symbol.dispose]());
    await expect(session.ready()).resolves.toMatchObject({
      tag: "ok",
      val: { alpnProtocol: "h2", encrypted: true },
    });
    const stream = session.request([{ name: ":path", value: encoder.encode("/") }], {});
    if (stream.tag === "err") {
      throw Object.assign(new Error(stream.val.message), stream.val);
    }
    await expect(stream.val.finish()).resolves.toMatchObject({
      tag: "ok",
      val: { body: encoder.encode("secure response") },
    });
  });

  test.each([false, true])("uses a real %s server callback round trip", async (secure) => {
    const [key, cert] = secure
      ? await Promise.all([
          readFile(
            new URL(
              "../../../../../../../preview2-shim/test/fixtures/tls/localhost.key",
              import.meta.url,
            ),
          ),
          readFile(
            new URL(
              "../../../../../../../preview2-shim/test/fixtures/tls/localhost.crt",
              import.meta.url,
            ),
          ),
        ])
      : [undefined, undefined];
    const listener: DirectHttp2StreamListener = {
      handle: async (stream) => ({
        tag: "ok",
        val: {
          headers: [
            { name: ":status", value: encoder.encode("202") },
            { name: "x-path", value: stream.headers.find(({ name }) => name === ":path")!.value },
          ],
          body: encoder.encode(`callback:${decoder.decode(stream.body)}`),
        },
      }),
      [Symbol.dispose](): void {},
    };
    const errorListener: DirectHttp2ServerErrorListener = {
      handle(error): void {
        throw Object.assign(new Error(error.message), error);
      },
      [Symbol.dispose](): void {},
    };
    const server = new Server(
      { secure, key, cert, settings: emptySettings },
      listener,
      errorListener,
    ) as DirectHttp2Server;
    closeables.push(() => server[Symbol.dispose]());
    const listened = await server.listen({ port: 0, host: "127.0.0.1" });
    expect(listened.tag).toBe("ok");
    if (listened.tag === "err" || listened.val.tag !== "tcp") {
      return;
    }
    const protocol = secure ? "https" : "http";
    await expect(
      nativeRequest(`${protocol}://127.0.0.1:${listened.val.val.port}`, secure),
    ).resolves.toBe("callback:request");
    await expect(server.close()).resolves.toEqual({ tag: "ok", val: true });
  });

  test("maps connection failures into structured Node errors", async () => {
    const session = new ClientSession("http://127.0.0.1:1", {
      settings: emptySettings,
    }) as DirectHttp2ClientSession;
    closeables.push(() => session[Symbol.dispose]());
    await expect(session.ready()).resolves.toMatchObject({
      tag: "err",
      val: { code: "ECONNREFUSED", syscall: "connect" },
    });
  });
});
