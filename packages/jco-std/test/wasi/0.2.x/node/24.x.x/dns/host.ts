import { describe, expect, test } from "vitest";

import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns-host.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns-host-node.js";
import { createDns } from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns/core.js";

describe("node:dns host providers", () => {
  test("denies DNS by default", () => {
    expect("query" in denyHost).toBe(false);
    expect(() => denyHost.getServers()).toThrow(
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
    const lookup = nodeHost.lookup("localhost", {
      family: "unspecified",
      hints: 0,
      all: false,
      order: "verbatim",
    });
    expect(lookup).toBeInstanceOf(Promise);
    const response = await lookup;
    expect(response.tag).toBe("ok");
    if (response.tag === "ok") {
      expect(response.val[0]).toEqual(
        expect.objectContaining({ address: expect.any(String), family: expect.any(String) }),
      );
      expect(response.val[0]?.family).toBeOneOf(["ipv4", "ipv6"]);
    }
  });

  test("resolves the external IANA example domain", async () => {
    const response = await nodeHost.resolve4("example.com", false);

    expect(response.tag).toBe("ok");
    if (response.tag === "ok") {
      expect(response.val).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ address: expect.stringMatching(/^\d{1,3}(?:\.\d{1,3}){3}$/) }),
        ]),
      );
    }
  });

  test("exports named DNS operations without a generic dispatcher", () => {
    expect("query" in nodeHost).toBe(false);
    expect(nodeHost).toEqual(
      expect.objectContaining({
        lookup: expect.any(Function),
        resolveAny: expect.any(Function),
        resolveTlsa: expect.any(Function),
        reverse: expect.any(Function),
      }),
    );
  });
});
