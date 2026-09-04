import { describe, expect, test } from "vitest";

import type { IncomingMessage } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/incoming-message.js";
import { nextTurn, recordingImplementation, response } from "./helpers/index.js";

describe("node:https get", () => {
  test.concurrent("ends the request itself and returns the same request shape", () => {
    const { https, requests } = recordingImplementation();
    const request = https.get("https://example.com/");
    expect(request).toBeInstanceOf(https.request("https://example.com/").constructor);
    expect(request.writableEnded).toBe(true);
    expect(requests[0]).toMatchObject({ method: "GET", scheme: "https", authority: "example.com" });
    expect(requests[0].body.byteLength).toBe(0);
  });

  test.concurrent("delivers response, data, and end asynchronously", async () => {
    const { https } = recordingImplementation(response("secure body"));
    const events: string[] = [];
    const message = new Promise<IncomingMessage>((resolve) => {
      https.get("https://example.com/", (incoming) => {
        events.push("callback");
        resolve(incoming);
      });
    });
    // The implementation returned synchronously, but nothing is observable until a later turn.
    expect(events).toEqual([]);
    const incoming = await message;
    incoming.setEncoding("utf8");
    const chunks: string[] = [];
    incoming.on("data", (chunk: string) => chunks.push(chunk));
    await new Promise<void>((resolve) => incoming.once("end", resolve));
    expect(events).toEqual(["callback"]);
    expect(chunks.join("")).toBe("secure body");
    expect(incoming.statusCode).toBe(200);
    expect(incoming.headers["content-type"]).toBe("text/plain");
  });

  test.concurrent("accepts options and a callback after a URL", async () => {
    const { https, requests } = recordingImplementation();
    const message = new Promise<IncomingMessage>((resolve) => {
      https.get(
        "https://example.com/base",
        { path: "/override", headers: { "X-A": "1" } },
        resolve,
      );
    });
    await message;
    expect(requests[0].pathWithQuery).toBe("/override");
    expect(requests[0].headers.some(({ name }) => name.toLowerCase() === "x-a")).toBe(true);
  });

  test.concurrent("reports implementation failures on the request", async () => {
    const https = recordingImplementation().https;
    const failing = recordingImplementation();
    failing.implementation.request = () => {
      throw Object.assign(new Error("boom"), { code: "ECONNREFUSED" });
    };
    void https;
    const request = failing.https.get("https://example.com/");
    const error = await new Promise<Error>((resolve) => request.once("error", resolve));
    expect(error).toMatchObject({ code: "ECONNREFUSED" });
    await nextTurn();
  });
});
