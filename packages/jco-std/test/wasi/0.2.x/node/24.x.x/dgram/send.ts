import { expect, test } from "vitest";
import { setup, event } from "./helpers/setup.js";
import { BlockList } from "../../../../../../src/wasi/0.2.x/node/24.x.x/net/block-list.js";

test("datagrams preserve empty, vector, binary and sliced payloads over real UDP", async () => {
  const dgram = setup();
  const server = dgram.createSocket("udp4");
  const client = dgram.createSocket("udp4");
  const address = server.bindSync({ address: "127.0.0.1" });
  try {
    const packets = [
      Buffer.from("hello"),
      new Uint8Array([0, 255, 1]),
      ["a", new DataView(new Uint8Array([0, 98]).buffer, 1)],
      [],
    ];
    for (const packet of packets) {
      const received = event(server, "message");
      const count = await new Promise<number>((resolve, reject) =>
        client.send(packet, address.port, address.address, (error, count) =>
          error ? reject(error) : resolve(count),
        ),
      );
      const [message, remote] = await received;
      const expected = Array.isArray(packet)
        ? Buffer.from(packet.length ? "ab" : "")
        : Buffer.from(packet);
      expect(message).toEqual(expected);
      expect(remote).toMatchObject({
        family: "IPv4",
        address: "127.0.0.1",
        size: expected.length,
        port: client.address().port,
      });
      expect(count).toBe(expected.length);
    }
    client.connectSync(address.port, address.address);
    const received = event(server, "message");
    client.send("xyz", 1, 1);
    expect((await received)[0]).toEqual(Buffer.from("y"));
    client.disconnect();
    const alias = event(server, "message");
    client.sendto(Buffer.from("abc"), 1, 1, address.port, address.address);
    expect((await alias)[0]).toEqual(Buffer.from("b"));
  } finally {
    client.close();
    server.close();
  }
});

test("send block lists fail callbacks", async () => {
  const dgram = setup();
  const block = new BlockList();
  block.addAddress("127.0.0.1");
  const socket = dgram.createSocket({ type: "udp4", sendBlockList: block });
  try {
    const error = await new Promise<Error | null>((resolve) =>
      socket.send("blocked", 12345, "127.0.0.1", resolve),
    );
    expect(error).toMatchObject({ code: "ERR_IP_BLOCKED" });
  } finally {
    socket.close();
  }
});

test.skipIf(!process.versions.node.startsWith("24."))(
  "send validates lists, byte offsets and connected overloads against Node 24",
  async () => {
    const { normalizeSend } =
      await import("../../../../../../src/wasi/0.2.x/node/24.x.x/dgram/send.js");
    const node = await import("node:dgram");
    const { errorShape } = await import("./helpers/setup.js");
    const socket = node.createSocket("udp4");
    try {
      const invalid: unknown[][] = [
        [],
        [23, 12345],
        [["ok", 23], 12345],
        [new Array(1), 12345],
        ["abc", 4, 0, 12345, "127.0.0.1"],
        ["abc", 0, 4, 12345, "127.0.0.1"],
        ["abc", 1n, 1, 12345, "127.0.0.1"],
        ["abc", 12345, false],
      ];
      for (const args of invalid) {
        expect(errorShape(() => Reflect.apply(normalizeSend, undefined, [false, ...args]))).toEqual(
          errorShape(() => Reflect.apply(socket.send, socket, args)),
        );
      }
    } finally {
      socket.close();
    }
  },
);

test("receive block lists discard blocked source addresses", async () => {
  const dgram = setup();
  const block = new BlockList();
  block.addAddress("127.0.0.2");
  const server = dgram.createSocket({ type: "udp4", receiveBlockList: block });
  const blocked = dgram.createSocket("udp4");
  const allowed = dgram.createSocket("udp4");
  const messages: string[] = [];
  server.on("message", (message) => messages.push(message.toString()));
  try {
    const address = server.bindSync({ address: "127.0.0.1" });
    blocked.bindSync({ address: "127.0.0.2" });
    const received = event(server, "message");
    await new Promise<void>((resolve, reject) =>
      blocked.send("blocked", address.port, address.address, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    allowed.send("allowed", address.port, address.address);
    await received;
    expect(messages).toEqual(["allowed"]);
  } finally {
    server.close();
    blocked.close();
    allowed.close();
  }
});
