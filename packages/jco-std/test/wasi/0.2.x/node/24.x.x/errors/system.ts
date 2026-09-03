import { describe, expect, test } from "vitest";

import { systemError } from "../../../../../../src/wasi/0.2.x/node/24.x.x/errors.js";

describe("Node system error shape", () => {
  test.concurrent("preserves documented system error fields", () => {
    const info = { reason: "fixture" };
    const error = systemError({
      address: "127.0.0.1",
      code: "ECONNREFUSED",
      dest: "/destination",
      errno: -111,
      info,
      message: "connect ECONNREFUSED 127.0.0.1:8080",
      path: "/source",
      port: 8080,
      syscall: "connect",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      address: "127.0.0.1",
      code: "ECONNREFUSED",
      dest: "/destination",
      errno: -111,
      info,
      message: "connect ECONNREFUSED 127.0.0.1:8080",
      path: "/source",
      port: 8080,
      syscall: "connect",
    });
    expect(Object.keys(error).sort()).toEqual([
      "address",
      "code",
      "dest",
      "errno",
      "info",
      "path",
      "port",
      "syscall",
    ]);
  });

  test.concurrent("omits optional fields that the host did not provide", () => {
    const error = systemError({ code: "ENOENT", message: "open ENOENT", syscall: "open" });
    expect(error).toMatchObject({ code: "ENOENT", syscall: "open" });
    expect(error).not.toHaveProperty("path");
    expect(error).not.toHaveProperty("errno");
  });
});
