import { describe, expect, test } from "vitest";

import { createNet } from "../../../../../../src/wasi/0.2.x/node/24.x.x/net/core.js";
import type {
  WasiSocketsProvider,
  WasiTcpSocket,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/wasi-sockets.js";
import type { SocketBase } from "../../../../../../src/wasi/0.2.x/node/24.x.x/net/socket.js";

function serverProvider(): {
  provider: WasiSocketsProvider;
  scheduled: Array<() => void | Promise<void>>;
  shutdowns: string[];
} {
  const scheduled: Array<() => void | Promise<void>> = [];
  const shutdowns: string[] = [];
  let accepted = false;
  const connection: WasiTcpSocket = {
    startConnect: () => undefined,
    finishConnect: () => void 0 as never,
    localAddress: () => ({ tag: "ipv4", val: { address: [127, 0, 0, 1], port: 8080 } }),
    remoteAddress: () => ({ tag: "ipv4", val: { address: [192, 0, 2, 10], port: 54321 } }),
    subscribe: () => ({ block: () => undefined }),
    shutdown: (direction) => shutdowns.push(direction),
  };
  const listener: WasiTcpSocket = {
    startBind(_network, address) {
      expect(address).toEqual({
        tag: "ipv4",
        val: { address: [127, 0, 0, 1], port: 8080 },
      });
    },
    finishBind: () => undefined,
    startConnect: () => undefined,
    finishConnect: () => void 0 as never,
    startListen: () => undefined,
    finishListen: () => undefined,
    accept() {
      if (accepted) {
        throw { tag: "would-block" };
      }
      accepted = true;
      return [
        connection,
        { blockingRead: () => void 0 as never },
        { blockingWriteAndFlush: () => undefined },
      ];
    },
    localAddress: () => ({ tag: "ipv4", val: { address: [127, 0, 0, 1], port: 8080 } }),
    subscribe: () => ({ block: () => undefined }),
    shutdown: () => undefined,
  };
  return {
    provider: {
      instanceNetwork: { instanceNetwork: () => ({}) },
      ipNameLookup: { resolveAddresses: () => void 0 as never },
      tcpCreateSocket: { createTcpSocket: () => listener },
      schedule: (task) => scheduled.push(task),
    },
    scheduled,
    shutdowns,
  };
}

describe("node:net Server", () => {
  test("rejects invalid listen ports synchronously", () => {
    const net = createNet(serverProvider().provider);
    for (const port of [-1, 65_536, 1.5, NaN]) {
      expect(() => net.createServer().listen({ port })).toThrow(
        expect.objectContaining({ code: "ERR_SOCKET_BAD_PORT" }),
      );
    }
  });
  test("listens, accepts a Socket, tracks it, and waits to close", async () => {
    const { provider, scheduled, shutdowns } = serverProvider();
    const net = createNet(provider);
    let accepted: SocketBase | undefined;
    const server = net.createServer((socket) => {
      accepted = socket;
    });
    const listening = new Promise<void>((resolve) => server.once("listening", resolve as never));
    server.listen(8080, "127.0.0.1");
    await listening;
    expect(server.address()).toEqual({ address: "127.0.0.1", family: "IPv4", port: 8080 });
    await scheduled.shift()?.();
    expect(accepted).toBeInstanceOf(net.Socket);
    expect(accepted).toMatchObject({
      remoteAddress: "192.0.2.10",
      remotePort: 54321,
      server,
    });
    await expect(
      new Promise<number>((resolve, reject) =>
        server.getConnections((error, count) => (error ? reject(error) : resolve(count))),
      ),
    ).resolves.toBe(1);

    const closed = new Promise<void>((resolve) =>
      server.close((error) => (error ? void 0 : resolve())),
    );
    let settled = false;
    void closed.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    accepted!.destroy();
    await closed;
    expect(shutdowns).toContain("both");
    expect(server.address()).toBeNull();
  });

  test("drops blocked peers before emitting connection", async () => {
    const { provider, scheduled } = serverProvider();
    const net = createNet(provider);
    const blockList = new net.BlockList();
    blockList.addSubnet("192.0.2.0", 24);
    const server = net.createServer({ blockList });
    const dropped = new Promise<object>((resolve) => server.once("drop", resolve as never));
    server.listen({ port: 8080, host: "127.0.0.1" });
    await Promise.resolve();
    await scheduled.shift()?.();
    await expect(dropped).resolves.toMatchObject({
      remoteAddress: "192.0.2.10",
      remotePort: 54321,
    });
    server.close();
  });

  test("transfers a BoundSocket exactly once", () => {
    const { provider } = serverProvider();
    const net = createNet(provider);
    const bound = new net.BoundSocket({ port: 8080, host: "127.0.0.1" });
    const server = net.createServer();
    server.listen(bound);
    expect(() => bound.close()).toThrow(
      expect.objectContaining({ code: "ERR_SOCKET_HANDLE_ADOPTED" }),
    );
    server.close();
  });

  test("rejects IPC and native listen flags explicitly", () => {
    const net = createNet(serverProvider().provider);
    expect(() => net.createServer().listen("/tmp/example.sock")).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => net.createServer().listen({ port: 80, reusePort: true })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });
});
