import { describe, expect, test, vi } from "vitest";

import { fakeDns } from "./helpers/index.js";
import { createDns } from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns/core.js";

describe("node:dns lookup APIs", () => {
  test("supports callback lookup overloads and schedules callbacks", async () => {
    const { modules, query } = fakeDns();
    const callback = vi.fn();
    modules.callback.lookup("example.test", { family: 6, all: true }, callback);
    expect(callback).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith(null, [{ address: "2001:db8::1", family: 6 }]);
    expect(JSON.parse(query.mock.calls[0][0]).operation).toBe("lookup");
  });

  test("resolves IP literals without consulting the provider", async () => {
    const { modules, query } = fakeDns();
    await expect(modules.promises.lookup("127.0.0.1")).resolves.toEqual({
      address: "127.0.0.1",
      family: 4,
    });
    expect(query).not.toHaveBeenCalled();
  });

  test("supports promise lookup and lookupService", async () => {
    const { modules } = fakeDns();
    await expect(modules.promises.lookup("example.test", { family: 4 })).resolves.toEqual({
      address: "192.0.2.1",
      family: 4,
    });
    await expect(modules.promises.lookupService("127.0.0.1", 80)).resolves.toEqual({
      hostname: "localhost",
      service: "http",
    });
  });

  test("validates options before host access", () => {
    const { modules, query } = fakeDns();
    expect(() => modules.callback.lookup("example.test", { family: 5 }, vi.fn())).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
    expect(() => modules.callback.lookup("example.test", { hints: 1 }, vi.fn())).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  test("validates lookupService addresses and ports synchronously", () => {
    const { modules, query } = fakeDns();
    expect(() => modules.callback.lookupService("not-an-ip", 80, vi.fn())).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
    expect(() => modules.callback.lookupService("127.0.0.1", 70000, vi.fn())).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  test("preserves structured provider errors", async () => {
    const modules = createDns({
      query: () =>
        JSON.stringify({
          ok: false,
          error: {
            name: "Error",
            message: "queryA ENOTFOUND missing.example",
            code: "ENOTFOUND",
            syscall: "queryA",
            hostname: "missing.example",
          },
        }),
    });
    await expect(modules.promises.lookup("missing.example")).rejects.toMatchObject({
      code: "ENOTFOUND",
      syscall: "queryA",
      hostname: "missing.example",
    });
  });
});
