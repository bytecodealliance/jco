import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2-host.js";
import { createDirectHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/direct/index.js";
import { createWasiHttpHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-http/index.js";
import { createWasiSocketsHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-sockets/index.js";
import {
  CLIENT_PREFACE,
  concat,
  encodeFrame,
  FLAG,
  FRAME,
  FrameReader,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/frames.js";
import {
  encodeHeaders,
  HpackDecoder,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/hpack.js";
import type { WasiSocketsProvider } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/wasi-sockets.js";
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

function socketsHarness() {
  let inputBytes = concat([
    encodeFrame({ type: FRAME.settings, flags: 0, streamId: 0, payload: new Uint8Array() }),
    encodeFrame({
      type: FRAME.headers,
      flags: FLAG.endHeaders,
      streamId: 1,
      payload: encodeHeaders([{ name: ":status", value: encoder.encode("200") }]),
    }),
    encodeFrame({
      type: FRAME.data,
      flags: FLAG.endStream,
      streamId: 1,
      payload: encoder.encode("response"),
    }),
  ]);
  let inputOffset = 0;
  const writes: Uint8Array[] = [];
  const scheduled: Array<() => void | Promise<void>> = [];
  let accepted = false;
  const input = {
    blockingRead(length: bigint) {
      if (inputOffset >= inputBytes.byteLength) {
        throw { tag: "closed" };
      }
      const end = Math.min(inputBytes.byteLength, inputOffset + Number(length));
      const result = inputBytes.slice(inputOffset, end);
      inputOffset = end;
      return result;
    },
  };
  const output = { blockingWriteAndFlush: (value: Uint8Array) => writes.push(value.slice()) };
  const connection = {
    startConnect() {},
    finishConnect: () => [input, output] as const,
    remoteAddress: () => ({
      tag: "ipv4" as const,
      val: { address: [192, 0, 2, 1] as [number, number, number, number], port: 1234 },
    }),
    subscribe: () => ({ block() {} }),
    shutdown() {},
  };
  const listener = {
    ...connection,
    startBind() {},
    finishBind() {},
    startListen() {},
    finishListen() {},
    accept() {
      if (accepted) {
        throw { tag: "would-block" };
      }
      accepted = true;
      return [connection, input, output] as const;
    },
    localAddress: () => ({
      tag: "ipv4" as const,
      val: { address: [127, 0, 0, 1] as [number, number, number, number], port: 8080 },
    }),
  };
  const provider: WasiSocketsProvider = {
    instanceNetwork: { instanceNetwork: () => ({}) },
    ipNameLookup: {
      resolveAddresses: () => {
        let done = false;
        return {
          resolveNextAddress() {
            if (done) {
              return undefined;
            }
            done = true;
            return { tag: "ipv4" as const, val: [192, 0, 2, 1] };
          },
          subscribe: () => ({ block() {} }),
        };
      },
    },
    tcpCreateSocket: { createTcpSocket: () => listener },
    schedule: (task) => scheduled.push(task),
  };
  return {
    implementation: createWasiSocketsHttp2Implementation(provider),
    async dispatch(stream: Http2IncomingStreamData): Promise<Http2OutgoingResponseData> {
      inputBytes = concat([
        CLIENT_PREFACE,
        encodeFrame({ type: FRAME.settings, flags: 0, streamId: 0, payload: new Uint8Array() }),
        encodeFrame({
          type: FRAME.headers,
          flags: FLAG.endHeaders,
          streamId: stream.id,
          payload: encodeHeaders(stream.headers),
        }),
        encodeFrame({
          type: FRAME.data,
          flags: FLAG.endStream,
          streamId: stream.id,
          payload: stream.body,
        }),
      ]);
      inputOffset = 0;
      writes.length = 0;
      await scheduled.shift()?.();
      const serve = scheduled.pop();
      await serve?.();
      const bytes = concat(writes);
      let offset = 0;
      const reader = new FrameReader({
        blockingRead(length: bigint) {
          if (offset >= bytes.byteLength) {
            throw { tag: "closed" };
          }
          const end = Math.min(bytes.byteLength, offset + Number(length));
          const result = bytes.slice(offset, end);
          offset = end;
          return result;
        },
      });
      const decoder = new HpackDecoder();
      let headers: Http2IncomingStreamData["headers"] = [];
      const body: Uint8Array[] = [];
      for (;;) {
        try {
          const frame = reader.readFrame();
          if (frame.type === FRAME.headers) {
            headers = decoder.decode(frame.payload);
          }
          if (frame.type === FRAME.data) {
            body.push(frame.payload);
          }
        } catch {
          break;
        }
      }
      return { headers, body: concat(body) };
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
  createHarness: socketsHarness,
  client: { supported: true },
  server: { supported: true },
});

http2ImplementationConformance("wasi-http", {
  createHarness: () => ({ implementation: createWasiHttpHttp2Implementation() }),
  client: { supported: false, errorCode: "ERR_JCO_UNSUPPORTED_NODE_API" },
  server: { supported: false, errorCode: "ERR_JCO_UNSUPPORTED_NODE_API" },
});
