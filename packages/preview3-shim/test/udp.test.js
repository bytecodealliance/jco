import dgram from "node:dgram";

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  UdpSocket,
  createUdpSocket,
  makeIpAddress,
  IP_ADDRESS_FAMILY,
} from "@bytecodealliance/preview3-shim/sockets";

const ipv4LocalAddress = makeIpAddress("ipv4", "127.0.0.1", 0);
const ipv6LocalAddress = makeIpAddress("ipv6", "::1", 0);

const createIpv4Socket = () => createUdpSocket(IP_ADDRESS_FAMILY.IPV4);
const createIpv6Socket = () => createUdpSocket(IP_ADDRESS_FAMILY.IPV6);

describe("UDP Socket Creation", () => {
  test("creates an IPv4 UDP socket", async () => {
    const sock = createUdpSocket(IP_ADDRESS_FAMILY.IPV4);
    expect(sock).toBeInstanceOf(UdpSocket);
    expect(sock.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV4);

    sock[Symbol.dispose]();
  });

  test("creates an IPv6 UDP socket", async () => {
    const sock = createIpv6Socket();
    expect(sock).toBeInstanceOf(UdpSocket);
    expect(sock.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV6);

    sock[Symbol.dispose]();
  });

  test("throws on invalid address family", async () => {
    await expect(() => createUdpSocket("invalid")).toThrow(
      expect.objectContaining({ payload: { tag: "invalid-argument" } }),
    );
  });
});

describe("UDP Socket Bind", () => {
  test("binds to a local IPv4 address", async () => {
    const sock = createIpv4Socket();
    expect(sock.bind(ipv4LocalAddress)).toBeUndefined();

    const local = sock.localAddress();
    expect(local.tag).toBe(IP_ADDRESS_FAMILY.IPV4);
    expect(local.val.address).toStrictEqual([127, 0, 0, 1]);
    expect(local.val.port).toBeGreaterThan(0);

    sock[Symbol.dispose]();
  });

  test("throws when binding with mismatched family", async () => {
    const sock = await createIpv4Socket();
    await expect(() => sock.bind(ipv6LocalAddress)).toThrow(
      expect.objectContaining({ payload: { tag: "invalid-argument" } }),
    );
  });

  test("throws when binding twice", async () => {
    const sock = await createIpv4Socket();
    await sock.bind(ipv4LocalAddress);
    await expect(() => sock.bind(ipv4LocalAddress)).toThrow(
      expect.objectContaining({ payload: { tag: "invalid-state" } }),
    );
  });

  test("throws on send before bind", async () => {
    const sock = await createIpv4Socket();
    await expect(sock.send(new Uint8Array([1, 2, 3]))).rejects.toSatisfy(
      (err) => err.payload.tag === "invalid-state",
    );
  });
});

describe("UDP Send/Receive without connect", () => {
  let server, port;

  beforeAll(async () => {
    server = dgram.createSocket("udp4");
    server.on("message", (msg, rinfo) => {
      server.send(Buffer.from("pong"), rinfo.port, rinfo.address);
    });

    await new Promise((resolve) => {
      server.bind(0, "127.0.0.1", () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  test("sends and receives via unconnected socket", async () => {
    const sock = createIpv4Socket();
    sock.bind(makeIpAddress("ipv4", "127.0.0.1", 0));

    const recvPromise = sock.receive();
    const msg = new TextEncoder().encode("hello");
    await sock.send(msg, makeIpAddress("ipv4", "127.0.0.1", port));

    const { data, addr } = await recvPromise;

    expect(data).toStrictEqual(new Uint8Array(Buffer.from("pong")));
    expect(addr.tag).toBe(IP_ADDRESS_FAMILY.IPV4);
    expect(addr.val.port).toBe(port);

    sock[Symbol.dispose]();
  });

  test("sends and receives via connected socket", async () => {
    const sock = createIpv4Socket();
    sock.bind(makeIpAddress("ipv4", "127.0.0.1", 0));
    sock.connect(makeIpAddress("ipv4", "127.0.0.1", port));

    const recvPromise = sock.receive();
    const msg = new TextEncoder().encode("ping");
    await sock.send(msg);

    const { data, addr } = await recvPromise;
    expect(data).toStrictEqual(new Uint8Array(Buffer.from("pong")));
    expect(addr.tag).toBe(IP_ADDRESS_FAMILY.IPV4);
    expect(addr.val.port).toBe(port);

    sock[Symbol.dispose]();
  });

  test("disconnect allows send with explicit address", async () => {
    const sock = createIpv4Socket();
    sock.bind(makeIpAddress("ipv4", "127.0.0.1", 0));
    sock.connect(makeIpAddress("ipv4", "127.0.0.1", port));
    sock.disconnect();
    const payload = new Uint8Array([9, 8, 7]);
    await expect(
      sock.send(payload, makeIpAddress("ipv4", "127.0.0.1", port)),
    ).resolves.toBeUndefined();

    sock[Symbol.dispose]();
  });

  test("send throws invalid-argument when remote-address mismatches connected peer", async () => {
    const sock = await createIpv4Socket();
    await sock.bind(makeIpAddress("ipv4", "127.0.0.1", 0));
    const peerA = makeIpAddress("ipv4", "127.0.0.1", 40000);
    const peerB = makeIpAddress("ipv4", "127.0.0.1", 40001);
    await sock.connect(peerA);
    const payload = new Uint8Array([0x01, 0x02, 0x03]);
    await expect(sock.send(payload, peerB)).rejects.toSatisfy(
      (err) => err.payload.tag === "invalid-argument",
    );

    sock[Symbol.dispose]();
  });
});
