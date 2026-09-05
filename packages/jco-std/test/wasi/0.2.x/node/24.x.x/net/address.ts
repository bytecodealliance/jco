import nodeNet from "node:net";

import { describe, expect, test } from "vitest";

import { BlockList } from "../../../../../../src/wasi/0.2.x/node/24.x.x/net/block-list.js";
import { isIP, isIPv4, isIPv6 } from "../../../../../../src/wasi/0.2.x/node/24.x.x/net/ip.js";
import { SocketAddress } from "../../../../../../src/wasi/0.2.x/node/24.x.x/net/socket-address.js";

describe("node:net address utilities", () => {
  test("matches Node IP predicates", () => {
    for (const input of [
      "127.0.0.1",
      "255.255.255.255",
      "256.0.0.1",
      "::",
      "2001:0db8::1",
      "::ffff:192.0.2.1",
      "fe80::1%eth0",
      "not-an-address",
      4,
      null,
    ]) {
      expect(isIP(input)).toBe(nodeNet.isIP(input as string));
      expect(isIPv4(input)).toBe(nodeNet.isIPv4(input as string));
      expect(isIPv6(input)).toBe(nodeNet.isIPv6(input as string));
    }
  });

  test("matches SocketAddress construction and parsing", () => {
    for (const options of [
      {},
      { family: "IPv6" },
      { address: "2001:0db8::1", family: "ipv6", port: 81 },
      { address: "2001:db8:0:1:2:3:4:5", family: "ipv6", port: 81 },
      { address: "0:0:0:0:0:ffff:192.0.2.1", family: "ipv6" },
      { address: "::ffff:192.0.2.1", family: "ipv6", flowlabel: 7 },
    ] as const) {
      expect(new SocketAddress(options).toJSON()).toEqual(
        new nodeNet.SocketAddress(options).toJSON(),
      );
    }
    for (const input of ["127.0.0.1:81", "127.0.0.1:80", "[2001:db8::1]:443", "localhost:80"]) {
      expect(SocketAddress.parse(input)?.toJSON()).toEqual(
        nodeNet.SocketAddress.parse(input)?.toJSON(),
      );
    }
    expect(Object.keys(new SocketAddress())).toEqual(Object.keys(new nodeNet.SocketAddress()));
    expect(new SocketAddress({ flowlabel: 1 }).flowlabel).toBe(0);
    expect(() => new SocketAddress({ address: "invalid" })).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ADDRESS" }),
    );
  });

  test("matches BlockList ordering, ranges, subnets, mapping, and JSON", () => {
    const actual = new BlockList();
    const expected = new nodeNet.BlockList();
    for (const blockList of [actual, expected]) {
      blockList.addAddress("192.0.2.1");
      blockList.addRange("192.0.2.5", "192.0.2.10");
      blockList.addSubnet("2001:db8::", 32, "ipv6");
    }
    expect(actual.rules).toEqual(expected.rules);
    expect(actual.toJSON()).toEqual(expected.toJSON());
    for (const [address, family] of [
      ["192.0.2.1", "ipv4"],
      ["192.0.2.7", "ipv4"],
      ["192.0.2.11", "ipv4"],
      ["2001:db8::abcd", "ipv6"],
      ["::ffff:192.0.2.1", "ipv6"],
    ] as const) {
      expect(actual.check(address, family)).toBe(expected.check(address, family));
    }
    expect(() => actual.check(123 as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    const mapped = new BlockList();
    mapped.addSubnet("::ffff:192.0.2.0", 120, "ipv6");
    expect(mapped.check("192.0.2.1")).toBe(true);
    const restored = new BlockList();
    const expectedRestored = new nodeNet.BlockList();
    restored.fromJSON(JSON.stringify(actual));
    expectedRestored.fromJSON(JSON.stringify(expected));
    expect(restored.rules).toEqual(expectedRestored.rules);
  });
});
