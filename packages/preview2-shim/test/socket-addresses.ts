import assert from "node:assert/strict";

import { suite, test } from "vitest";

import { ipSocketAddress } from "../src/io/worker-sockets.js";
import { checkTcpAddresses, checkUdpAddresses } from "./fixtures/sockets/address-families.mjs";

suite("socket address families", () => {
    test.each(["ipv4", "IPv4", 4])("normalizes IPv4 family %s", (family) => {
        assert.deepStrictEqual(ipSocketAddress(family, "127.0.0.1", 1234), {
            tag: "ipv4",
            val: { address: [127, 0, 0, 1], port: 1234 },
        });
    });

    test.each(["ipv6", "IPv6", 6])("normalizes IPv6 family %s", (family) => {
        assert.deepStrictEqual(ipSocketAddress(family, "::1", 1234), {
            tag: "ipv6",
            val: { address: [0, 0, 0, 0, 0, 0, 0, 1], port: 1234, flowInfo: 0, scopeId: 0 },
        });
    });

    test.each([0, 5, "unix", ""])("rejects unknown family %s", (family) => {
        assert.throws(
            () => ipSocketAddress(family, "127.0.0.1", 1234),
            (e) => e === "invalid-argument",
        );
    });

    test.each(["ipv4", "ipv6"])("TCP worker addresses (%s)", checkTcpAddresses);
    test.each(["ipv4", "ipv6"])("UDP worker addresses (%s)", checkUdpAddresses);
});
