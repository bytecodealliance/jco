import { describe, expect, test } from "vitest";

import type { IncomingMessage } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/incoming-message.js";
import { nextTurn, recordingImplementation } from "./helpers/index.js";

describe("node:http client requests", () => {
  test.concurrent("gives an agent: false request a fresh agent instead of none", () => {
    const { http } = recordingImplementation();
    const request = http.request({ host: "example.com", agent: false });
    expect(request.agent).toBeInstanceOf(http.Agent);
    expect(request.agent).not.toBe(http.globalAgent);
    expect(request.agent.keepAlive).toBe(false);
    expect(http.request({ host: "example.com", agent: null }).agent).toBe(http.globalAgent);
    expect(http.request({ host: "example.com" }).agent).toBe(http.globalAgent);
  });

  test.concurrent("normalizes URL options and buffers a request body", async () => {
    const { http, requests } = recordingImplementation();
    const events: string[] = [];
    const response = new Promise<IncomingMessage>((resolve) => {
      const request = http.request(
        new URL("http://example.com:8080/a?b=1"),
        { method: "post", headers: { "X-Test": "yes" } },
        resolve,
      );
      request.on("finish", () => events.push("finish"));
      request.write("hello ");
      request.end("world");
    });
    const message = await response;
    expect(events).toEqual(["finish"]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      authority: "example.com:8080",
      pathWithQuery: "/a?b=1",
    });
    expect(new TextDecoder().decode(requests[0].body)).toBe("hello world");
    expect(
      requests[0].headers.map(({ name, value }) => [
        name.toLowerCase(),
        new TextDecoder().decode(value),
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["host", "example.com:8080"],
        ["x-test", "yes"],
        ["content-length", "11"],
      ]),
    );
    expect(message.statusCode).toBe(200);
  });

  test.concurrent("get ends automatically and delivers buffered response events asynchronously", async () => {
    const { http } = recordingImplementation();
    const order: string[] = [];
    http.get("http://example.com/", (message) => {
      order.push("response");
      expect(message.headers["set-cookie"]).toEqual(["first=1", "second=2"]);
      message.setEncoding("utf8");
      message.on("data", (chunk: string) => order.push(`data:${chunk}`));
      message.on("end", () => order.push("end"));
    });
    order.push("sync");
    await nextTurn();
    expect(order).toEqual(["sync", "response", "data:response body", "end"]);
  });

  test.concurrent("rejects protocols that do not belong to node:http", () => {
    const { http } = recordingImplementation();
    expect(() => http.request("https://example.com/")).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_PROTOCOL" }),
    );
  });

  test.concurrent("makes deprecated and socket-owned operations explicit", () => {
    const { http } = recordingImplementation();
    const request = http.request("http://example.com/");
    expect(() => request.abort()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
    expect(() => request.setNoDelay()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test.concurrent("does not cross the implementation boundary for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort("cancelled");
    const { http, requests } = recordingImplementation();
    const request = http.request("http://example.com/", { signal: controller.signal });
    const error = new Promise<Error>((resolve) => request.once("error", resolve));
    request.end();
    await expect(error).resolves.toMatchObject({ name: "AbortError", code: "ABORT_ERR" });
    expect(requests).toHaveLength(0);
  });

  test.concurrent("validates implementation timeout values before sending", () => {
    const { http } = recordingImplementation();
    const request = http.request("http://example.com/");
    expect(() => request.setTimeout("10" as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => request.setTimeout(-1)).toThrow(
      expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
    );
  });
});
