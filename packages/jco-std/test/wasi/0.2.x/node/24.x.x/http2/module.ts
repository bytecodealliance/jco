import * as nodeHttp2 from "node:http2";

import { describe, expect, test } from "vitest";

import { constants } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/constants.js";
import { createHttp2 } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/core.js";
import { createWasiHttpHttp2Implementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/wasi-http/index.js";

describe("node:http2 module", () => {
  test("matches the Node 24 export contract", () => {
    const http2 = createHttp2(createWasiHttpHttp2Implementation());
    expect(Object.keys(http2).sort()).toEqual(
      Object.keys(nodeHttp2)
        .filter((key) => key !== "default")
        .sort(),
    );
  });

  test("matches all Node 24.19.0 constants", () => {
    expect(constants).toEqual(nodeHttp2.constants);
    expect(Object.keys(constants)).toHaveLength(240);
  });

  test("keeps default and named values coherent", () => {
    const http2 = createHttp2(createWasiHttpHttp2Implementation());
    expect(http2.constants).toBe(constants);
    expect(typeof http2.sensitiveHeaders).toBe("symbol");
    expect(http2.Http2ServerRequest.name).toBe("Http2ServerRequest");
    expect(http2.Http2ServerResponse.name).toBe("Http2ServerResponse");
  });
});
