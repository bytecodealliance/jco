import nodeHttp from "node:http";

import { describe, expect, test } from "vitest";

import { createHttp } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/http-host.js";
import { createDirectHttpImplementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/direct.js";
import { recordingImplementation } from "./helpers/index.js";

describe("node:http module", () => {
  test("exposes the Node 24 module surface", () => {
    const { http } = recordingImplementation();
    expect(Object.keys(http).sort()).toEqual(Object.keys(nodeHttp).sort());
    expect(http.METHODS).toEqual(nodeHttp.METHODS);
    expect(http.STATUS_CODES).toEqual(nodeHttp.STATUS_CODES);
    expect(http.maxHeaderSize).toBe(nodeHttp.maxHeaderSize);
    expect(new http.Agent().keepAlive).toBe(new nodeHttp.Agent().keepAlive);
    expect(http.globalAgent.keepAlive).toBe(nodeHttp.globalAgent.keepAlive);
  });

  test("denies the direct capability by default", async () => {
    const http = createHttp(createDirectHttpImplementation(denyHost));
    expect(() => http.createServer()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_HTTP_ADAPTER_REQUIRED" }),
    );
    const request = http.request("http://example.com/");
    const error = new Promise<Error>((resolve) => request.once("error", resolve));
    request.end();
    await expect(error).resolves.toMatchObject({ code: "ERR_JCO_HTTP_ADAPTER_REQUIRED" });
  });

  test("rejects server construction when an implementation cannot listen", () => {
    const { http } = recordingImplementation();
    expect(() => http.createServer(() => undefined)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("matches stable parser-limit validation codes", () => {
    const { http } = recordingImplementation();
    expect(() => http.setMaxIdleHTTPParsers("1" as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => http.setMaxIdleHTTPParsers(0)).toThrow(
      expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
    );
  });
});
