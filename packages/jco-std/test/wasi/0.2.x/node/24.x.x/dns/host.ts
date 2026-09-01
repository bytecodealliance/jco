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

  test("uses the real Node DNS implementation when explicitly selected", async () => {
    const query = nodeHost.query(
      JSON.stringify({
        operation: "lookup",
        args: ["localhost", { family: 0, hints: 0, all: false, order: "verbatim" }],
      }),
    );
    expect(query).toBeInstanceOf(Promise);
    const response = JSON.parse(await query) as DnsResponse;
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.value).toEqual(
        expect.objectContaining({ address: expect.any(String), family: expect.any(Number) }),
      );
      expect((response.value as { family: number }).family).toBeOneOf([4, 6]);
    }
  });

  test("resolves the external IANA example domain", async () => {
    const response = JSON.parse(
      await nodeHost.query(JSON.stringify({ operation: "resolve4", args: ["example.com"] })),
    ) as DnsResponse;

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.value).toEqual(
        expect.arrayContaining([expect.stringMatching(/^\d{1,3}(?:\.\d{1,3}){3}$/)]),
      );
    }
  });

  test("rejects operations outside the DNS provider allowlist", async () => {
    const response = JSON.parse(
      await nodeHost.query(JSON.stringify({ operation: "constructor", args: [] })),
    ) as DnsResponse;
    expect(response).toMatchObject({
      ok: false,
      error: { code: "ERR_JCO_UNSUPPORTED_NODE_API" },
    });
  });
});
