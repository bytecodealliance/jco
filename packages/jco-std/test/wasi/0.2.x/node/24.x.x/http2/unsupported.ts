import { describe, expect, test } from "vitest";

import { createHttp2 } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/core.js";
import { createWasiHttpHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-http.js";
import { createWasiSocketsHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-sockets.js";

describe.each([
  ["wasi-sockets", createWasiSocketsHttp2Implementation],
  ["wasi-http", createWasiHttpHttp2Implementation],
] as const)("node:http2 via %s", (_name, createImplementation) => {
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
