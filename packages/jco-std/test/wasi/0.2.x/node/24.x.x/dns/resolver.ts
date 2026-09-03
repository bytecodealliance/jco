import { describe, expect, test, vi } from "vitest";

import { createDns } from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns/core.js";
import { fakeDns } from "./helpers/index.js";

describe("node:dns Resolver and record queries", () => {
  test.concurrent("tracks independent resolver configuration", async () => {
    const { modules, host } = fakeDns();
    const resolver = new modules.promises.Resolver({ timeout: 250, tries: 2 });
    resolver.setServers(["203.0.113.53"]);
    resolver.setLocalAddress("192.0.2.10", "2001:db8::10");
    await expect(resolver.resolve4("example.test", { ttl: true })).resolves.toEqual([
      { address: "192.0.2.1", ttl: 60 },
    ]);
    expect(host.resolve4).toHaveBeenLastCalledWith("example.test", true, {
      options: { timeout: 250, tries: 2 },
      servers: ["203.0.113.53"],
      localAddress: ["192.0.2.10", "2001:db8::10"],
    });
  });

  test.concurrent("supports callback record families", async () => {
    const { modules } = fakeDns();
    const callback = vi.fn();
    modules.callback.resolveMx("example.test", callback);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith(null, [{ exchange: "mail.example", priority: 10 }]);
  });

  test.concurrent("rejects unsupported record types explicitly", () => {
    const { modules } = fakeDns();
    expect(() => modules.callback.resolve("example.test", "BOGUS", vi.fn())).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
  });

  test.concurrent("makes cancellation an explicit unsupported operation", () => {
    const { modules } = fakeDns();
    expect(() => new modules.callback.Resolver().cancel()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => new modules.promises.Resolver().cancel()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test.concurrent("validates resolver options before accessing the provider", () => {
    const { modules, host } = fakeDns();
    expect(() => new modules.callback.Resolver({ tries: 0 })).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
    expect(() => new modules.promises.Resolver({ timeout: -2 })).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
    expect(host.getServers).not.toHaveBeenCalled();
    expect(host.resolve4).not.toHaveBeenCalled();
  });

  test.concurrent("preserves TLSA bytes across the typed boundary", async () => {
    const { host } = fakeDns();
    host.resolveTlsa.mockReturnValue({
      tag: "ok",
      val: [{ certUsage: 3, selector: 1, match: 1, data: Uint8Array.from([1, 2, 3]) }],
    });
    const modules = createDns(host);
    const records = await modules.promises.resolveTlsa("_443._tcp.example.test");
    expect(Array.from(new Uint8Array(records[0].data))).toEqual([1, 2, 3]);
  });
});
