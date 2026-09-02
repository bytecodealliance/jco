import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2-host.js";
import { createDirectHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/direct.js";
import { createWasiHttpHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-http.js";
import { createWasiSocketsHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-sockets.js";
import type {
  DirectHttp2ServerErrorListener,
  DirectHttp2Settings,
  DirectHttp2StreamListener,
  Http2IncomingStreamData,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/types.js";
import { http2ImplementationConformance } from "./helpers/conformance.js";

const encoder = new TextEncoder();

function directHarness() {
  let listener: DirectHttp2StreamListener | undefined;
  return {
    implementation: createDirectHttp2Implementation({
      ClientSession: class {
        ready = () => ({
          tag: "ok" as const,
          val: {
            alpnProtocol: "h2c",
            encrypted: false,
            localSettings: { customSettings: [] },
            remoteSettings: { customSettings: [] },
          },
        });
        request = () => ({
          tag: "ok" as const,
          val: {
            write: () => ({ tag: "ok" as const, val: true }),
            finish: () => ({
              tag: "ok" as const,
              val: { headers: [], trailers: [], body: encoder.encode("response") },
            }),
            close: () => ({ tag: "ok" as const, val: undefined }),
            id: () => 1,
            state: () => ({}),
            [Symbol.dispose](): void {},
          },
        });
        close = () => ({ tag: "ok" as const, val: undefined });
        destroy = () => ({ tag: "ok" as const, val: undefined });
        settings = (value: DirectHttp2Settings) => ({ tag: "ok" as const, val: value });
        ping = (payload: Uint8Array) => ({ tag: "ok" as const, val: { durationMs: 1, payload } });
        goaway = () => ({ tag: "ok" as const, val: undefined });
        ref(): void {}
        unref(): void {}
        [Symbol.dispose](): void {}
      },
      Server: class {
        constructor(
          _options: unknown,
          value: DirectHttp2StreamListener,
          _errorListener: DirectHttp2ServerErrorListener,
        ) {
          listener = value;
        }
        listen = () => ({
          tag: "ok" as const,
          val: { tag: "tcp" as const, val: { address: "127.0.0.1", family: "IPv4", port: 8080 } },
        });
        close = () => ({ tag: "ok" as const, val: true });
        address = () => undefined;
        updateSettings = () => ({ tag: "ok" as const, val: undefined });
        ref(): void {}
        unref(): void {}
        [Symbol.dispose](): void {}
      },
    }),
    async dispatch(stream: Http2IncomingStreamData) {
      const result = await listener!.handle(stream);
      if (result.tag === "err") {
        throw new Error(result.val.message);
      }
      return result.val;
    },
  };
}

http2ImplementationConformance("default-deny", {
  createHarness: () => ({ implementation: createDirectHttp2Implementation(denyHost) }),
  client: { supported: false, errorCode: "ERR_JCO_HTTP2_ADAPTER_REQUIRED" },
  server: { supported: false, errorCode: "ERR_JCO_HTTP2_ADAPTER_REQUIRED" },
});

http2ImplementationConformance("direct", {
  createHarness: directHarness,
  client: { supported: true },
  server: { supported: true },
});

http2ImplementationConformance("wasi-sockets", {
  createHarness: () => ({ implementation: createWasiSocketsHttp2Implementation() }),
  client: { supported: false, errorCode: "ERR_JCO_UNSUPPORTED_NODE_API" },
  server: { supported: false, errorCode: "ERR_JCO_UNSUPPORTED_NODE_API" },
});

http2ImplementationConformance("wasi-http", {
  createHarness: () => ({ implementation: createWasiHttpHttp2Implementation() }),
  client: { supported: false, errorCode: "ERR_JCO_UNSUPPORTED_NODE_API" },
  server: { supported: false, errorCode: "ERR_JCO_UNSUPPORTED_NODE_API" },
});
