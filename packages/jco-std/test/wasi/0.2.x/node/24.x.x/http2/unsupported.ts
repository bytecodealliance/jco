import { describe, expect, test } from "vitest";

import { createHttp2 } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/core.js";
import { createWasiHttpHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-http.js";
import { createWasiSocketsHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-sockets.js";
import type { WasiSocketsProvider } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/wasi-sockets.js";

describe("node:http2 via wasi-http", () => {
  const createImplementation = createWasiHttpHttp2Implementation;
  test("rejects clients before acquiring network resources", () => {
    const http2 = createHttp2(createImplementation());
    expect(() => http2.connect("http://127.0.0.1:1")).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("rejects servers immediately", () => {
    const http2 = createHttp2(createImplementation());
    expect(() => http2.createServer()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("keeps capability-free settings available", () => {
    const http2 = createHttp2(createImplementation());
    expect(http2.getDefaultSettings().maxFrameSize).toBe(16_384);
  });
});

describe("node:http2 TLS via wasi-sockets", () => {
  const provider = {
    instanceNetwork: {
      instanceNetwork: () => {
        throw new Error("network accessed");
      },
    },
    ipNameLookup: {
      resolveAddresses: () => {
        throw new Error("network accessed");
      },
    },
    tcpCreateSocket: {
      createTcpSocket: () => {
        throw new Error("network accessed");
      },
    },
  } as unknown as WasiSocketsProvider;
  const http2 = createHttp2(createWasiSocketsHttp2Implementation(provider));

  test("rejects HTTPS before acquiring a raw socket", () => {
    expect(() => http2.connect("https://example.com")).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("rejects secure servers before acquiring a raw socket", () => {
    expect(() => http2.createSecureServer()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });
});
