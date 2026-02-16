import { TextEncoder } from "node:util";

import { describe, test, expect, afterAll, beforeAll } from "vitest";

import { Fields, HttpServer, Response } from "@bytecodealliance/preview3-shim/http";

import { future } from "@bytecodealliance/preview3-shim/future";
import { stream } from "@bytecodealliance/preview3-shim/stream";

import { getRandomPort } from "../helpers";

const ENCODER = new TextEncoder();

describe("HttpServer Integration", () => {
  let server;
  let host;
  let port;

  beforeAll(async () => {
    const handler = {
      async handle() {
        const { tx: bodyTx, rx: bodyRx } = stream();
        const { tx: trailersTx, rx: trailersRx } = future();
        const headers = new Fields();
        headers.append("content-type", ENCODER.encode("text/plain"));
        headers.append("trailer", ENCODER.encode("content-md5"));

        const [res] = Response.new(headers, bodyRx, trailersRx);

        res.setStatusCode(200);
        await bodyTx.write(Buffer.from("hello world"));
        await bodyTx.close();
        await trailersTx.write(null);
        return { tag: "ok", val: res };
      },
    };

    server = new HttpServer(handler);
    host = "127.0.0.1";
    port = await getRandomPort();
    await server.listen(port, host);
  });

  afterAll(async () => {
    await server.close();
  });

  test('responds with 200 and "hello world"', async () => {
    const res = await fetch(`http:${host}:${port}/`);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toBe("hello world");
    expect(res.headers.get("content-type")).toBe("text/plain");
  });
});

describe("HttpServer Error", () => {
  test("emits error event when handler throws", async (done) => {
    let host = "127.0.0.1";
    let port = await getRandomPort();

    const throwingHandler = {
      async handle() {
        throw new Error("handler failure");
      },
    };

    const server = new HttpServer(throwingHandler);
    server.on("error", (err) => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("handler failure");
      server.close().then(done);
    });

    server.listen(port, host).then(() => {
      fetch(`http://${host}:${port}/`).catch(() => {});
    });
  });
});
