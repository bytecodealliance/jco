import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  TcpSocket,
  tcpCreateSocket,
  IP_ADDRESS_FAMILY,
} from "@bytecodealliance/preview3-shim/sockets";

describe("TcpSocket Creation", () => {
  it("should create an IPv4 socket", async () => {
    const socket = await tcpCreateSocket.createTcpSocket(
      IP_ADDRESS_FAMILY.IPV4,
    );

    expect(socket).toBeInstanceOf(TcpSocket);
    expect(socket.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV4);
  });

  it("should create an IPv6 socket", async () => {
    const socket = await tcpCreateSocket.createTcpSocket(
      IP_ADDRESS_FAMILY.IPV6,
    );

    expect(socket).toBeInstanceOf(TcpSocket);
    expect(socket.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV6);
  });

  it("should throw on invalid address family", async () => {
    await expect(tcpCreateSocket.createTcpSocket("invalid")).rejects.toBe(
      "invalid-argument",
    );
  });
});
