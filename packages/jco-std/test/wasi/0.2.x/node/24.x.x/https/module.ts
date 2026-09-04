import nodeHttp from "node:http";
import nodeHttps from "node:https";
import * as nodeHttpsNamespace from "node:https";

import { describe, expect, test } from "vitest";

import { Agent as HttpAgent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/agent.js";
import { createHttp } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import { createDirectHttpImplementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/direct.js";
import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/http-host.js";
import { createHttps } from "../../../../../../src/wasi/0.2.x/node/24.x.x/https/core.js";
import { recordingImplementation } from "./helpers/index.js";

describe("node:https module", () => {
  test.concurrent("exposes the Node 24 module surface", () => {
    const { https } = recordingImplementation();
    expect(Object.keys(https).sort()).toEqual(Object.keys(nodeHttps).sort());
  });

  test.concurrent("matches Node's default-versus-namespace split", () => {
    // node:https has no `default` key of its own; the namespace adds one, so the two objects
    // are never the same value and a `default` import sees only the six real exports.
    expect(nodeHttpsNamespace.default).not.toBe(nodeHttpsNamespace);
    expect(Object.keys(nodeHttpsNamespace).sort()).toEqual(
      [...Object.keys(nodeHttps), "default"].sort(),
    );
  });

  test.concurrent("exposes a strictly smaller surface than node:http", () => {
    const { https } = recordingImplementation();
    const { http } = { http: createHttp({ request: () => response() }) };
    expect(Object.keys(https).every((name) => name in http)).toBe(true);
    expect(Object.keys(http).length).toBeGreaterThan(Object.keys(https).length);
    function response(): never {
      throw new Error("not used");
    }
  });

  test.concurrent("subclasses the node:http agent on both chains", () => {
    const { https } = recordingImplementation();
    expect(Object.getPrototypeOf(https.Agent)).toBe(HttpAgent);
    expect(Object.getPrototypeOf(https.Agent.prototype)).toBe(HttpAgent.prototype);
    expect(new https.Agent()).toBeInstanceOf(HttpAgent);
  });

  test.concurrent("gives each protocol its own classes and global agent", () => {
    const { https } = recordingImplementation();
    const http = createHttp({
      request: () => {
        throw new Error("not used");
      },
    });
    expect(https.Agent).not.toBe(http.Agent);
    expect(https.globalAgent).not.toBe(http.globalAgent);
    expect(https.Server).not.toBe(http.Server);
    expect(https.request).not.toBe(http.request);
  });

  test.concurrent("keeps one Agent class across module instances", () => {
    expect(recordingImplementation().https.Agent).toBe(recordingImplementation().https.Agent);
    expect(recordingImplementation().https.globalAgent).toBe(
      recordingImplementation().https.globalAgent,
    );
  });

  test.concurrent("denies the direct capability by default", async () => {
    const https = createHttps(createDirectHttpImplementation(denyHost));
    expect(() => https.createServer()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_HTTP_ADAPTER_REQUIRED" }),
    );
    const request = https.request("https://example.com/");
    const error = new Promise<Error>((resolve) => request.once("error", resolve));
    request.end();
    await expect(error).resolves.toMatchObject({ code: "ERR_JCO_HTTP_ADAPTER_REQUIRED" });
  });

  test.concurrent("rejects server construction when an implementation cannot listen", () => {
    const { https } = recordingImplementation();
    expect(() => https.createServer(() => undefined)).toThrow(
      expect.objectContaining({
        code: "ERR_JCO_UNSUPPORTED_NODE_API",
        message: expect.stringContaining("https.Server"),
      }),
    );
  });

  test.concurrent("matches Node's callable shapes", () => {
    const { https } = recordingImplementation();
    for (const name of ["createServer", "get", "request"] as const) {
      expect(typeof https[name]).toBe("function");
      expect(typeof nodeHttps[name]).toBe("function");
    }
    for (const name of ["Agent", "Server"] as const) {
      expect(typeof https[name]).toBe("function");
      expect(https[name].prototype).toBeTypeOf("object");
    }
  });

  test.concurrent("omits the node:http-only exports Node also omits", () => {
    const { https } = recordingImplementation();
    for (const name of [
      "METHODS",
      "STATUS_CODES",
      "maxHeaderSize",
      "IncomingMessage",
      "OutgoingMessage",
      "ServerResponse",
      "ClientRequest",
      "validateHeaderName",
      "validateHeaderValue",
      "setMaxIdleHTTPParsers",
      "setGlobalProxyFromEnv",
      "_connectionListener",
      "WebSocket",
    ]) {
      expect(name in https).toBe(false);
      expect(name in nodeHttps).toBe(false);
      expect(name in nodeHttp).toBe(true);
    }
  });

  test.concurrent("does not touch globals on import", () => {
    const before = Object.keys(globalThis).length;
    recordingImplementation();
    expect(Object.keys(globalThis).length).toBe(before);
  });
});
