import { describe, expect, test } from "vitest";

import { createWasiSocketsHttpTransport } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/transports/wasi-sockets.js";
import type {
  WasiInputStream,
  WasiOutputStream,
  WasiSocketsProvider,
  WasiTcpSocket,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/transports/wasi-sockets.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("node:http wasi:sockets transport", () => {
  test("resolves, connects, writes HTTP/1.1, and reads a response", () => {
    const writes: Uint8Array[] = [];
    let shutdown: string | undefined;
    let connectBlocked = 0;
    const input: WasiInputStream = {
      blockingRead() {
        return encoder.encode("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nX-Test: yes\r\n\r\nok");
      },
    };
    const output: WasiOutputStream = {
      blockingWriteAndFlush(contents) {
        writes.push(contents.slice());
      },
    };
    const socket: WasiTcpSocket = {
      startConnect(_network, address) {
        expect(address).toEqual({
          tag: "ipv4",
          val: { address: [192, 0, 2, 1], port: 8080 },
        });
      },
      finishConnect() {
        if (connectBlocked++ === 0) {
          throw { tag: "would-block" };
        }
        return [input, output];
      },
      subscribe() {
        return { block: () => undefined };
      },
      shutdown(direction) {
        shutdown = direction;
      },
    };
    const provider: WasiSocketsProvider = {
      instanceNetwork: { instanceNetwork: () => ({}) },
      ipNameLookup: {
        resolveAddresses() {
          let yielded = false;
          return {
            resolveNextAddress() {
              if (yielded) {
                return undefined;
              }
              yielded = true;
              return { tag: "ipv4", val: [192, 0, 2, 1] };
            },
            subscribe: () => ({ block: () => undefined }),
          };
        },
      },
      tcpCreateSocket: { createTcpSocket: () => socket },
    };
    const response = createWasiSocketsHttpTransport(provider).request({
      method: "GET",
      scheme: "http",
      authority: "example.com:8080",
      pathWithQuery: "/",
      headers: [{ name: "Host", value: encoder.encode("example.com:8080") }],
      body: new Uint8Array(),
    });

    expect(connectBlocked).toBe(2);
    expect(decoder.decode(writes[0])).toContain("GET / HTTP/1.1\r\n");
    expect(decoder.decode(response.body)).toBe("ok");
    expect(response.headers).toEqual([
      { name: "Content-Length", value: encoder.encode("2") },
      { name: "X-Test", value: encoder.encode("yes") },
    ]);
    expect(shutdown).toBe("both");
  });

  test("maps resolver failures to Node-style errors", () => {
    const provider: WasiSocketsProvider = {
      instanceNetwork: { instanceNetwork: () => ({}) },
      ipNameLookup: {
        resolveAddresses: () => {
          throw { tag: "name-unresolvable" };
        },
      },
      tcpCreateSocket: {
        createTcpSocket: () => {
          throw new Error("unreachable");
        },
      },
    };
    expect(() =>
      createWasiSocketsHttpTransport(provider).request({
        method: "GET",
        scheme: "http",
        authority: "missing.invalid",
        pathWithQuery: "/",
        headers: [],
        body: new Uint8Array(),
      }),
    ).toThrow(expect.objectContaining({ code: "ENOTFOUND", syscall: "getaddrinfo" }));
  });

  test("rejects unsupported socket deadline polling explicitly", () => {
    const provider = {
      instanceNetwork: { instanceNetwork: () => ({}) },
      ipNameLookup: {
        resolveAddresses: () => {
          throw new Error("must not resolve");
        },
      },
      tcpCreateSocket: {
        createTcpSocket: () => {
          throw new Error("must not connect");
        },
      },
    } satisfies WasiSocketsProvider;
    expect(() =>
      createWasiSocketsHttpTransport(provider).request({
        method: "GET",
        scheme: "http",
        authority: "example.com",
        pathWithQuery: "/",
        headers: [],
        body: new Uint8Array(),
        connectTimeoutMs: 100,
      }),
    ).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
  });
});
