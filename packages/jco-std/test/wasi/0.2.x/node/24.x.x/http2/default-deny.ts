import { describe, expect, test } from "vitest";

import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2-host.js";
import { createHttp2 } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/core.js";
import { createDirectHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/direct/index.js";

describe("default-deny node:http2 provider", () => {
  const http2 = createHttp2(createDirectHttp2Implementation(denyHost));

  test("denies client sessions", () => {
    expect(() => http2.connect("http://localhost:8000")).toThrow(
      expect.objectContaining({ code: "ERR_JCO_HTTP2_ADAPTER_REQUIRED" }),
    );
  });

  test("denies cleartext and secure servers", () => {
    expect(() => http2.createServer()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_HTTP2_ADAPTER_REQUIRED" }),
    );
    expect(() => http2.createSecureServer({ key: "key", cert: "cert" })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_HTTP2_ADAPTER_REQUIRED" }),
    );
  });
});
