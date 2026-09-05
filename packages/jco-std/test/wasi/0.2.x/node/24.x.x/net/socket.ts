import { describe, expect, test, vi } from "vitest";

import { createNet } from "../../../../../../src/wasi/0.2.x/node/24.x.x/net/core.js";
import { createProvider } from "./helpers/provider.js";
import type {
  WasiInputStream,
  WasiOutputStream,
  WasiSocketsProvider,
  WasiTcpSocket,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/wasi-sockets.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function clientProvider(): { provider: WasiSocketsProvider; writes: Uint8Array[] } {
  const writes: Uint8Array[] = [];
  let read = false;
  const input: WasiInputStream = {
    blockingRead() {
      if (read) {
        throw { tag: "closed" };
      }
      read = true;
      return encoder.encode("reply");
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
        val: { address: [192, 0, 2, 8], port: 8080 },
      });
    },
    finishConnect: () => [input, output],
    localAddress: () => ({ tag: "ipv4", val: { address: [127, 0, 0, 1], port: 49152 } }),
    remoteAddress: () => ({ tag: "ipv4", val: { address: [192, 0, 2, 8], port: 8080 } }),
    subscribe: () => ({ block: () => undefined }),
    shutdown: () => undefined,
  };
  const provider: WasiSocketsProvider = {
    instanceNetwork: { instanceNetwork: () => ({}) },
    ipNameLookup: {
      resolveAddresses: () => {
        let yielded = false;
        return {
          resolveNextAddress() {
            if (yielded) {
              return undefined;
            }
            yielded = true;
            return { tag: "ipv4", val: [192, 0, 2, 8] };
          },
          subscribe: () => ({ block: () => undefined }),
        };
      },
    },
    tcpCreateSocket: { createTcpSocket: () => socket },
  };
  return { provider, writes };
}

describe("node:net Socket", () => {
  test("does not acquire a transport for an already aborted signal", async () => {
    const { provider, disposed } = createProvider();
    const acquire = vi.spyOn(provider.instanceNetwork, "instanceNetwork");
    const socket = createNet(provider).connect({ port: 80, signal: AbortSignal.abort() });
    const error = new Promise<Error>((resolve) => socket.once("error", resolve));
    await expect(error).resolves.toMatchObject({ code: "ABORT_ERR" });
    expect(acquire).not.toHaveBeenCalled();
    expect(disposed).toEqual([]);
  });

  test("removes the abort listener when a socket is destroyed", async () => {
    const { provider } = createProvider();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const socket = createNet(provider).connect({
      port: 80,
      host: "127.0.0.1",
      signal: controller.signal,
    });
    await Promise.resolve();
    socket.destroy();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  test("keeps the receive side open after end() and honors pause/resume", async () => {
    const { provider, tasks, disposed } = createProvider([encoder.encode("reply")]);
    const socket = createNet(provider).connect(80, "127.0.0.1").setEncoding("utf8");
    const received: string[] = [];
    socket.on("data", (chunk: string) => received.push(chunk));
    await Promise.resolve();
    socket.pause().end("request");
    await tasks.shift()?.();
    expect(received).toEqual([]);
    expect(socket.readyState).toBe("readOnly");
    expect(disposed).toEqual(["network", "output"]);
    socket.resume();
    while (tasks.length) {
      await tasks.shift()?.();
    }
    expect(received).toEqual(["reply"]);
    expect(socket.destroyed).toBe(true);
  });

  test("preserves unread data for read() and delayed async iteration", async () => {
    const { provider, tasks } = createProvider([encoder.encode("one"), encoder.encode("two")]);
    const socket = createNet(provider).connect(80, "127.0.0.1");
    socket.setEncoding("utf8");
    await Promise.resolve();
    await tasks.shift()?.();
    expect(socket.read()).toBe("one");
    await tasks.shift()?.();
    await tasks.shift()?.();
    const received: string[] = [];
    for await (const chunk of socket) {
      received.push(String(chunk));
    }
    expect(received).toEqual(["two"]);
  });

  test("decodes split UTF-8 and flushes incomplete characters at EOF", async () => {
    const { provider, tasks } = createProvider([
      new Uint8Array([0xe2]),
      new Uint8Array([0x82, 0xac, 0xe2]),
    ]);
    const socket = createNet(provider).connect(80, "127.0.0.1").setEncoding("utf8");
    const data: string[] = [];
    socket.on("data", (chunk: string) => data.push(chunk));
    await Promise.resolve();
    while (tasks.length) {
      await tasks.shift()?.();
    }
    expect(data).toEqual(["€", "�"]);
  });

  test("supports Node encodings for reads and writes", async () => {
    const { provider, tasks, writes } = createProvider([new Uint8Array([0x80, 0xff])]);
    const socket = createNet(provider).connect(80, "127.0.0.1").setEncoding("latin1");
    socket.write("cafe", "hex");
    await Promise.resolve();
    await tasks.shift()?.();
    expect(socket.read()).toBe("\u0080\u00ff");
    expect(writes).toEqual([new Uint8Array([0xca, 0xfe])]);
    socket.destroy();
  });

  test("limits onread reads to the supplied buffer without losing bytes", async () => {
    const { provider, tasks, readLengths } = createProvider([encoder.encode("abcdef")]);
    const data: string[] = [];
    const socket = createNet(provider).connect({
      port: 80,
      host: "127.0.0.1",
      onread: {
        buffer: new Uint8Array(2),
        callback(length, buffer) {
          data.push(decoder.decode(buffer.subarray(0, length)));
          return true;
        },
      },
    });
    await Promise.resolve();
    while (tasks.length) {
      await tasks.shift()?.();
    }
    expect(data.join("")).toBe("abcdef");
    expect(readLengths).toEqual([2n, 2n, 2n, 2n]);
    expect(socket.bytesRead).toBe(6);
  });

  test("rejects async iteration on a transport error and disposes resources once", async () => {
    const { provider, tasks, disposed, failRead } = createProvider();
    const socket = createNet(provider).connect(80, "127.0.0.1");
    await Promise.resolve();
    const iterator = socket[Symbol.asyncIterator]();
    const next = expect(iterator.next()).rejects.toMatchObject({ code: "ECONNRESET" });
    failRead({ tag: "connection-reset" });
    await tasks.shift()?.();
    await next;
    socket.destroy();
    expect(disposed.sort()).toEqual(["input", "network", "output", "socket"]);
  });

  test("destroySoon closes a half-open socket after its writes finish", async () => {
    const { provider, disposed, writes } = createProvider();
    const socket = createNet(provider).connect({
      port: 80,
      host: "127.0.0.1",
      allowHalfOpen: true,
    });
    await Promise.resolve();
    socket.write("done");
    socket.destroySoon();
    await Promise.resolve();
    expect(socket.destroyed).toBe(true);
    expect(writes).toEqual([encoder.encode("done")]);
    expect(disposed.sort()).toEqual(["input", "network", "output", "socket"]);
  });

  test("does not emit lookup for a numeric address", async () => {
    const { provider } = createProvider();
    const socket = createNet(provider).connect(80, "127.0.0.1");
    const lookups: unknown[] = [];
    socket.on("lookup", (...args: unknown[]) => {
      lookups.push(args);
    });
    await Promise.resolve();
    expect(lookups).toEqual([]);
    socket.destroy();
  });

  test("connects, exposes addresses, writes, reads, and closes", async () => {
    const { provider, writes } = clientProvider();
    const net = createNet(provider);
    const socket = net.createConnection(8080, "example.com");
    socket.setEncoding("utf8");
    const events: string[] = [];
    socket.on("lookup", (() => events.push("lookup")) as never);
    socket.on("connect", (() => {
      events.push("connect");
      socket.write("request");
    }) as never);
    const data = new Promise<string>((resolve) => socket.once("data", resolve as never));
    const close = new Promise<void>((resolve) => socket.once("close", resolve as never));
    expect(await data).toBe("reply");
    await close;
    expect(events).toEqual(["lookup", "connect"]);
    expect(decoder.decode(writes[0])).toBe("request");
    expect(socket.bytesWritten).toBe(7);
    expect(socket.bytesRead).toBe(5);
    expect(socket.remoteAddress).toBe("192.0.2.8");
    expect(socket.address()).toEqual({ address: "127.0.0.1", family: "IPv4", port: 49152 });
  });

  test("rejects IPC, custom lookup, and native-only socket options explicitly", () => {
    const net = createNet(clientProvider().provider);
    expect(() => net.connect("/tmp/example.sock")).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => net.connect({ port: 80, lookup: () => undefined })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => new net.Socket().setTypeOfService(1)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => new net.Socket().resetAndDestroy()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });
});
