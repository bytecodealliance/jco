import { expect, test } from "vitest";
import nodeDgram from "node:dgram";
import { setup, event, errorShape } from "./helpers/setup.js";

test("bind, connect, disconnect, close, disposal and error lifecycle", async () => {
  const dgram = setup();
  const server = dgram.createSocket("udp4");
  const client = dgram.createSocket("udp4");
  try {
    const listening = event(server, "listening");
    expect(server.bind({ port: 0, address: "127.0.0.1" })).toBe(server);
    await listening;
    expect(server.address()).toMatchObject({ address: "127.0.0.1", family: "IPv4" });
    expect(() => server.bind(0)).toThrow(
      expect.objectContaining({ code: "ERR_SOCKET_ALREADY_BOUND" }),
    );
    const connected = event(client, "connect");
    expect(client.connect(server.address().port, "localhost")).toBeUndefined();
    await connected;
    expect(client.remoteAddress()).toEqual(server.address());
    client.disconnect();
    expect(() => client.remoteAddress()).toThrow(
      expect.objectContaining({ code: "ERR_SOCKET_DGRAM_NOT_CONNECTED" }),
    );
    client.connectSync(server.address().port, "127.0.0.1");
    expect(client.remoteAddress()).toEqual(server.address());
  } finally {
    await client[Symbol.asyncDispose]();
    await server[Symbol.asyncDispose]();
  }
  await client[Symbol.asyncDispose]();
  expect(() => client.close()).toThrow(
    expect.objectContaining({ code: "ERR_SOCKET_DGRAM_NOT_RUNNING" }),
  );
});

test("custom lookup and AbortSignal", async () => {
  const calls: unknown[] = [];
  const controller = new AbortController();
  const socket = setup().createSocket({
    type: "udp4",
    signal: controller.signal,
    lookup(name, family, callback) {
      calls.push([name, family]);
      queueMicrotask(() => callback(null, "127.0.0.1", 4));
    },
  });
  const listening = event(socket, "listening");
  socket.bind(0, "example.invalid");
  await listening;
  expect(calls).toEqual([["example.invalid", 4]]);
  const closed = event(socket, "close");
  controller.abort();
  await closed;
  expect(() => socket.address()).toThrow(
    expect.objectContaining({ code: "ERR_SOCKET_DGRAM_NOT_RUNNING" }),
  );
});

test("bind failures leave the socket reusable and remove bind callbacks", async () => {
  const dgram = setup();
  const first = dgram.createSocket("udp4");
  const second = dgram.createSocket("udp4");
  try {
    const address = first.bindSync({ port: 0, address: "127.0.0.1" });
    const failed = new Promise<Error>((resolve) => second.once("error", resolve));
    let called = false;
    second.bind(address.port, address.address, () => {
      called = true;
    });
    expect(await failed).toMatchObject({
      code: "EADDRINUSE",
      address: "127.0.0.1",
      port: address.port,
    });
    expect(called).toBe(false);
    second.bindSync({ address: "127.0.0.1" });
    expect(second.address().port).toBeGreaterThan(0);
  } finally {
    first.close();
    second.close();
  }
});

test.skipIf(!process.versions.node.startsWith("24."))(
  "validation agrees with Node 24 for synchronous public failures",
  () => {
    const dgram = setup();
    const guest = dgram.createSocket("udp4");
    const native = nodeDgram.createSocket("udp4");
    try {
      const cases = [
        (socket: typeof guest) => socket.connect(0),
        (socket: typeof guest) => socket.connect(65536),
        (socket: typeof guest) => socket.disconnect(),
        (socket: typeof guest) => socket.remoteAddress(),
        (socket: typeof guest) => socket.send("x", -1),
        (socket: typeof guest) => socket.setRecvBufferSize(-1),
      ];
      for (const call of cases) {
        expect(errorShape(() => call(guest))).toEqual(
          errorShape(() => call(native as unknown as typeof guest)),
        );
      }
    } finally {
      guest.close();
      native.close();
    }
  },
);
