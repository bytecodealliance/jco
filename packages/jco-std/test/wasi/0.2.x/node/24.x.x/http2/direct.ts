import { describe, expect, test } from "vitest";

import { createHttp2 } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/core.js";
import { createDirectHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/direct.js";
import type {
  DirectHttp2ClientOptions,
  DirectHttp2RequestOptions,
  DirectHttp2ServerErrorListener,
  DirectHttp2ServerOptions,
  DirectHttp2Settings,
  DirectHttp2StreamListener,
  Http2IncomingStreamData,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/types.js";

const encoder = new TextEncoder();
const emptySettings: DirectHttp2Settings = { customSettings: [] };

function fakeHost() {
  let errorListener: DirectHttp2ServerErrorListener | undefined;
  let listener: DirectHttp2StreamListener | undefined;
  let settings = emptySettings;
  return {
    host: {
      ClientSession: class {
        constructor(_authority: string, options: DirectHttp2ClientOptions) {
          settings = options.settings;
        }

        ready() {
          return {
            tag: "ok" as const,
            val: {
              alpnProtocol: "h2c",
              encrypted: false,
              localSettings: settings,
              remoteSettings: emptySettings,
            },
          };
        }

        request(_headers: unknown, _options: DirectHttp2RequestOptions) {
          const chunks: Uint8Array[] = [];
          return {
            tag: "ok" as const,
            val: {
              write(chunk: Uint8Array) {
                chunks.push(chunk);
                return { tag: "ok" as const, val: true };
              },
              finish() {
                return {
                  tag: "ok" as const,
                  val: {
                    headers: [
                      { name: ":status", value: encoder.encode("201") },
                      {
                        name: "x-body-size",
                        value: encoder.encode(String(chunks[0]?.byteLength ?? 0)),
                      },
                    ],
                    trailers: [],
                    body: encoder.encode("response"),
                  },
                };
              },
              close: () => ({ tag: "ok" as const, val: undefined }),
              id: () => 1,
              state: () => ({ state: 2 }),
              [Symbol.dispose](): void {},
            },
          };
        }

        close() {
          return { tag: "ok" as const, val: undefined };
        }

        destroy() {
          return { tag: "ok" as const, val: undefined };
        }

        settings(value: DirectHttp2Settings) {
          settings = value;
          return { tag: "ok" as const, val: value };
        }

        ping(payload: Uint8Array) {
          return { tag: "ok" as const, val: { durationMs: 1, payload } };
        }

        goaway() {
          return { tag: "ok" as const, val: undefined };
        }

        ref(): void {}

        unref(): void {}

        [Symbol.dispose](): void {}
      },
      Server: class {
        constructor(
          _options: DirectHttp2ServerOptions,
          streamListener: DirectHttp2StreamListener,
          serverErrorListener: DirectHttp2ServerErrorListener,
        ) {
          errorListener = serverErrorListener;
          listener = streamListener;
        }

        listen() {
          return {
            tag: "ok" as const,
            val: { tag: "tcp" as const, val: { address: "127.0.0.1", family: "IPv4", port: 8000 } },
          };
        }

        close() {
          return { tag: "ok" as const, val: true };
        }

        address() {
          return { tag: "tcp" as const, val: { address: "127.0.0.1", family: "IPv4", port: 8000 } };
        }

        updateSettings() {
          return { tag: "ok" as const, val: undefined };
        }

        ref(): void {}

        unref(): void {}

        [Symbol.dispose](): void {}
      },
    },
    async dispatch(stream: Http2IncomingStreamData) {
      return listener!.handle(stream);
    },
    emitServerError(message: string) {
      errorListener!.handle({ name: "Error", message, code: "EHTTP2TEST" });
    },
  };
}

describe("direct node:http2 implementation", () => {
  test("round trips client headers, data, settings, ping, and lifecycle", async () => {
    const harness = fakeHost();
    const http2 = createHttp2(createDirectHttp2Implementation(harness.host));
    const session = http2.connect("http://example.com", { settings: { enablePush: false } });
    await new Promise<void>((resolve) => session.once("connect", resolve));
    expect(session.alpnProtocol).toBe("h2c");
    expect(session.localSettings.enablePush).toBe(false);

    const stream = session.request({ ":path": "/items", "content-type": "text/plain" });
    const events: string[] = [];
    stream.on("response", (headers: Record<string, unknown>) =>
      events.push(String(headers[":status"])),
    );
    stream.on("data", (chunk: Uint8Array) => events.push(new TextDecoder().decode(chunk)));
    stream.on("end", () => events.push("end"));
    stream.end("request");
    await new Promise<void>((resolve) => stream.once("close", resolve));
    expect(events).toEqual(["201", "response", "end"]);

    await new Promise<void>((resolve, reject) => {
      session.settings({ maxConcurrentStreams: 3 }, (error, settings) => {
        if (error) {
          reject(error);
        }
        expect(settings.maxConcurrentStreams).toBe(3);
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      session.ping(encoder.encode("12345678"), (error, _duration, payload) => {
        if (error) {
          reject(error);
        }
        expect(new TextDecoder().decode(payload)).toBe("12345678");
        resolve();
      });
    });
    await new Promise<void>((resolve) => session.close(resolve));
    expect(session.closed).toBe(true);
  });

  test("round trips stream and compatibility server callbacks", async () => {
    const harness = fakeHost();
    const http2 = createHttp2(createDirectHttp2Implementation(harness.host));
    const server = http2.createServer();
    server.on("stream", (stream: { respond(headers: object): void; end(body: string): void }) => {
      stream.respond({ ":status": 202, "x-handler": "stream" });
      stream.end("accepted");
    });
    server.listen(8000);
    const result = await harness.dispatch({
      sessionId: 1,
      id: 1,
      headers: [
        { name: ":method", value: encoder.encode("POST") },
        { name: ":path", value: encoder.encode("/items") },
      ],
      body: encoder.encode("request"),
    });
    expect(result.tag).toBe("ok");
    if (result.tag === "ok") {
      expect(new TextDecoder().decode(result.val.body)).toBe("accepted");
    }
    expect(server.address()).toEqual({ address: "127.0.0.1", family: "IPv4", port: 8000 });
    const sessionError = new Promise<Error>((resolve) => server.once("sessionError", resolve));
    harness.emitServerError("provider failure");
    await expect(sessionError).resolves.toMatchObject({
      message: "provider failure",
      code: "EHTTP2TEST",
    });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test("rejects unsupported options before constructing resources", () => {
    const harness = fakeHost();
    const http2 = createHttp2(createDirectHttp2Implementation(harness.host));
    expect(() => http2.connect("http://example.com", { createConnection() {} })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => http2.createServer({ selectPadding() {} })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("uses Node's server class names", () => {
    const http2 = createHttp2(createDirectHttp2Implementation(fakeHost().host));
    expect(http2.createServer().constructor.name).toBe("Http2Server");
    expect(http2.createSecureServer().constructor.name).toBe("Http2SecureServer");
  });
});
