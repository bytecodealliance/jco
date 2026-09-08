import { describe, expect, test, vi } from "vitest";

import { createDns } from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns/core.js";
import type { DnsHost } from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns/types.js";
import type { HostImports } from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/wit-types.js";
import { fakeDns } from "./helpers/index.js";

function provider(host: DnsHost, mode: string): HostImports<DnsHost> {
  if (mode === "tagged") {
    return host;
  }
  return Object.fromEntries(
    Object.entries(host).map(([name, operation]) => [
      name,
      (...args: unknown[]) => {
        const result = operation(...args);
        if (result.tag === "err") {
          throw mode === "ComponentError"
            ? Object.assign(new Error("WIT error"), { payload: result.val })
            : result.val;
        }
        return result.val;
      },
    ]),
  ) as HostImports<DnsHost>;
}

describe.each(["tagged", "unwrapped", "ComponentError"])("node:dns host results: %s", (mode) => {
  test("accepts server lists, lookup records, and resolver results", async () => {
    const { host } = fakeDns();
    const { callback, promises } = createDns(provider(host, mode));
    const servers = callback.getServers();
    servers.push("198.51.100.53");
    expect(callback.getServers()).toEqual(["192.0.2.53"]);
    callback.setServers(["198.51.100.53"]);
    expect(callback.getServers()).toEqual(["198.51.100.53"]);
    await expect(promises.lookup("example.test")).resolves.toEqual({
      address: "192.0.2.1",
      family: 4,
    });
    await expect(promises.lookupService("127.0.0.1", 80)).resolves.toEqual({
      hostname: "localhost",
      service: "http",
    });
    await expect(promises.resolve4("example.test", { ttl: true })).resolves.toEqual([
      { address: "192.0.2.1", ttl: 60 },
    ]);
    await expect(promises.resolveTxt("example.test")).resolves.toEqual([]);
  });

  test("preserves error fields for synchronous, callback, and promise APIs", async () => {
    const { host } = fakeDns();
    const error = {
      name: "Error",
      message: "lookup failed",
      code: "ENOTFOUND",
      errno: { tag: "symbolic" as const, val: "ENOTFOUND" },
      syscall: "getaddrinfo",
      hostname: "missing.test",
    };
    host.getServers.mockReturnValue({ tag: "err", val: error });
    host.lookup.mockReturnValue({ tag: "err", val: error });
    const { callback, promises } = createDns(provider(host, mode));
    const expected = expect.objectContaining({ ...error, errno: "ENOTFOUND" });
    expect(() => callback.getServers()).toThrow(expected);
    const done = vi.fn();
    callback.lookup("missing.test", done);
    expect(done).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(done.mock.calls[0][0]).toEqual(expected);
    await expect(promises.lookup("missing.test")).rejects.toThrow(expected);
  });
});

test("node:dns preserves non-WIT provider errors", () => {
  const { host } = fakeDns();
  const error = new WebAssembly.RuntimeError("unreachable");
  host.getServers.mockImplementation(() => {
    throw error;
  });
  expect(() => createDns(host).callback.getServers()).toThrow(error);
});
