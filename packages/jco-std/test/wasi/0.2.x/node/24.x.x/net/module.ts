import nodeNet from "node:net";

import { describe, expect, test } from "vitest";

import { createNet } from "../../../../../../src/wasi/0.2.x/node/24.x.x/net/core.js";
import type { WasiSocketsProvider } from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/wasi-sockets.js";

const provider = {
  instanceNetwork: { instanceNetwork: () => ({}) },
  ipNameLookup: { resolveAddresses: () => void 0 as never },
  tcpCreateSocket: { createTcpSocket: () => void 0 as never },
} satisfies WasiSocketsProvider;

describe("node:net module", () => {
  test("matches the Node 24.19 export surface and aliases", () => {
    const net = createNet(provider);
    expect(Object.keys(net).sort()).toEqual(Object.keys(nodeNet).sort());
    expect(net.connect).toBe(net.createConnection);
    expect(net.Socket).toBe(net.Stream);
  });

  test("provides callable Socket and Server constructors", () => {
    const net = createNet(provider);
    expect(net.Socket()).toBeInstanceOf(net.Socket);
    expect(net.Server()).toBeInstanceOf(net.Server);
    expect(net.Socket({ allowHalfOpen: true }).allowHalfOpen).toBe(true);
    expect(net.Server({ keepAliveInitialDelay: 2_000, highWaterMark: -1 })).toMatchObject({
      keepAliveInitialDelay: 2,
      highWaterMark: 65_536,
    });
  });

  test("normalizes the stable connect and listen overloads", () => {
    const callback = () => undefined;
    for (const args of [
      [80, "example.com", callback],
      ["/tmp/example.sock", callback],
      [{ port: 443, host: "example.com" }, callback],
    ] as const) {
      const [actualOptions, actualCallback] = createNet(provider)._normalizeArgs(args);
      const [expectedOptions, expectedCallback] = nodeNet._normalizeArgs(args);
      expect(actualOptions).toEqual(expectedOptions);
      expect(actualCallback).toBe(expectedCallback);
    }
  });

  test("matches family-default state and validation", () => {
    const net = createNet(provider);
    const originalFamily = nodeNet.getDefaultAutoSelectFamily();
    const originalTimeout = nodeNet.getDefaultAutoSelectFamilyAttemptTimeout();
    try {
      net.setDefaultAutoSelectFamily(false);
      expect(net.getDefaultAutoSelectFamily()).toBe(false);
      net.setDefaultAutoSelectFamilyAttemptTimeout(1);
      expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(10);
      expect(() => net.setDefaultAutoSelectFamily("yes" as never)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
      expect(() => net.setDefaultAutoSelectFamilyAttemptTimeout(0)).toThrow(
        expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
      );
    } finally {
      net.setDefaultAutoSelectFamily(originalFamily);
      net.setDefaultAutoSelectFamilyAttemptTimeout(originalTimeout);
    }
  });

  test("fails raw libuv handle creation explicitly", () => {
    expect(() => createNet(provider)._createServerHandle()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => createNet(provider).Socket({ fd: 1 })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });
});
