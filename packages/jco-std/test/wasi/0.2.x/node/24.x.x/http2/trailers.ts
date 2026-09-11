import { connect, createServer } from "node:http2";
import { expect, test } from "vitest";

import { ServerHttp2Stream } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/stream.js";
import {
  Http2ServerRequest,
  Http2ServerResponse,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/server.js";
import { fieldsToHeaders } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/headers.js";

const requestData = { sessionId: 1, id: 1, headers: [], body: new Uint8Array() };

test("server trailers wait for readiness and can only be sent once", async () => {
  const stream = new ServerHttp2Stream(requestData, {});

  expect(() => stream.sendTrailers({})).toThrow(
    expect.objectContaining({ code: "ERR_HTTP2_TRAILERS_NOT_READY" }),
  );
  stream.respond({ ":status": 200 }, { waitForTrailers: true });
  stream.once("wantTrailers", () => {
    expect(() => stream.sendTrailers({ ":status": 200 })).toThrow(
      expect.objectContaining({ code: "ERR_HTTP2_INVALID_PSEUDOHEADER" }),
    );
    expect(() => stream.sendTrailers({ "x-invalid": "a\nb" })).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_CHAR" }),
    );
    stream.sendTrailers({ "grpc-status": "0" });
    expect(() => stream.sendTrailers({})).toThrow(
      expect.objectContaining({ code: "ERR_HTTP2_TRAILERS_ALREADY_SENT" }),
    );
  });
  stream.end("message");

  const response = await stream.response();

  expect(fieldsToHeaders(response.trailers).headers).toEqual({ "grpc-status": "0" });
  expect(new TextDecoder().decode(response.body)).toBe("message");
  await Promise.resolve();
  expect(() => stream.sendTrailers({})).toThrow(
    expect.objectContaining({ code: "ERR_HTTP2_INVALID_STREAM" }),
  );
});

test("server trailers can be supplied asynchronously after finish", async () => {
  const stream = new ServerHttp2Stream(requestData, {});

  const events: string[] = [];

  stream.respond({ ":status": 200 }, { waitForTrailers: true });
  stream.once("finish", () => events.push("finish"));
  stream.once("wantTrailers", () => {
    events.push("wantTrailers");
    queueMicrotask(() => stream.sendTrailers({ "grpc-status": "3" }));
  });
  stream.end();

  const response = await stream.response();

  expect(events).toEqual(["finish", "wantTrailers"]);
  expect(response.body).toEqual(new Uint8Array());
  expect(fieldsToHeaders(response.trailers).headers).toEqual({ "grpc-status": "3" });
});

test("waiting without a trailer listener completes with empty trailers", async () => {
  const stream = new ServerHttp2Stream(requestData, {});

  stream.respond({ ":status": 200 }, { waitForTrailers: true });
  stream.end();
  expect((await stream.response()).trailers).toEqual([]);
});

test("addTrailers and setTrailer preserve the same metadata as native Node", async () => {
  function respond(response: Pick<Http2ServerResponse, "setTrailer" | "addTrailers" | "end">) {
    response.setTrailer("X-Result", "old");
    response.addTrailers({ "x-result": "new", "grpc-status": "0" });
    response.addTrailers({ "x-count": 2, "set-cookie": ["one=1", "two=2"] });
    response.end("body");
  }

  const server = createServer((_request, response) => respond(response));

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP address");
  }

  const client = connect(`http://127.0.0.1:${address.port}`);

  try {
    const nativeTrailers = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = client.request({ ":path": "/" });

      request.on("error", reject);
      request.on("trailers", resolve);
      request.resume();
      request.end();
    });

    const stream = new ServerHttp2Stream(requestData, {});

    const request = new Http2ServerRequest(requestData, stream);

    respond(new Http2ServerResponse(request));

    const response = await stream.response();

    expect(fieldsToHeaders(response.trailers).headers).toEqual(
      Object.fromEntries(Object.entries(nativeTrailers)),
    );
    expect(new TextDecoder().decode(response.body)).toBe("body");
  } finally {
    client.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
