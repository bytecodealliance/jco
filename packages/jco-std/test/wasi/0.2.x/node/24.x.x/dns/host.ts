import { describe, expect, test } from "vitest";

import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns-host.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns-host-node.js";
import { createDns } from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns/core.js";
import type { DnsResponse } from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns/types.js";

describe("node:dns host providers", () => {
  test("denies DNS by default", () => {
    expect(() => denyHost.query("{}")).toThrow(
      expect.objectContaining({ code: "ERR_JCO_DNS_ADAPTER_REQUIRED" }),
    );
    const modules = createDns(denyHost);
    expect(() => modules.callback.getServers()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_DNS_ADAPTER_REQUIRED" }),
    );
    modules.callback.setDefaultResultOrder("ipv6first");
    expect(modules.promises.getDefaultResultOrder()).toBe("ipv6first");
  });

  test("uses the real Node DNS implementation when explicitly selected", () => {
    const response = JSON.parse(
      nodeHost.query(
        JSON.stringify({
          operation: "lookup",
          args: ["localhost", { family: 0, hints: 0, all: false, order: "verbatim" }],
        }),
      ),
    ) as DnsResponse;
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.value).toEqual(
        expect.objectContaining({ address: expect.any(String), family: expect.any(Number) }),
      );
      expect((response.value as { family: number }).family).toBeOneOf([4, 6]);
    }
  });

  test("rejects operations outside the DNS provider allowlist", () => {
    const response = JSON.parse(
      nodeHost.query(JSON.stringify({ operation: "constructor", args: [] })),
    ) as DnsResponse;
    expect(response).toMatchObject({
      ok: false,
      error: { code: "ERR_JCO_UNSUPPORTED_NODE_API" },
    });
  });
});
