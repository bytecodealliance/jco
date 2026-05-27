import { describe, test, expect } from "vitest";
import { ResourceWorker } from "../lib/nodejs/workers/resource-worker.js";

const _worker = new ResourceWorker(new URL("./nop-worker.js", import.meta.url));

describe("ResourceWorker round-trip", () => {
  test("async run nop", async () => {
    await expect(_worker.run({ op: "nop" })).resolves.toEqual({ ok: true });
  });

  test("sync run nop", () => {
    expect(_worker.runSync({ op: "nop" })).toEqual({ ok: true });
  });

  test("async run err", async () => {
    await expect(_worker.run({ op: "err" })).rejects.toThrow("err");
  });

  test("async run err preserves code", async () => {
    await expect(_worker.run({ op: "err-code" })).rejects.toMatchObject({
      message: "read ECONNRESET",
      code: "ECONNRESET",
      errno: -54,
      syscall: "read",
    });
  });

  test("sync run err", () => {
    expect(() => _worker.runSync({ op: "err" })).toThrow("err");
  });

  test("sync run err preserves code", () => {
    try {
      _worker.runSync({ op: "err-code" });
      throw new Error("expected err-code to throw");
    } catch (err) {
      expect(err).toMatchObject({
        message: "read ECONNRESET",
        code: "ECONNRESET",
        errno: -54,
        syscall: "read",
      });
    }
  });
});
