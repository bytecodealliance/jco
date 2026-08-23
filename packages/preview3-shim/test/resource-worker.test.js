import { describe, test, expect, vi } from "vitest";
import { Worker } from "node:worker_threads";
import { ResourceWorker } from "../dist/nodejs/workers/resource-worker.js";

const _worker = new ResourceWorker(() => new Worker(new URL("./nop-worker.js", import.meta.url)));

describe("ResourceWorker round-trip", () => {
  test("async run nop", async () => {
    await expect(_worker.run({ op: "nop" })).resolves.toEqual({ ok: true });
  });

  test("sync run nop", () => {
    expect(_worker.runSync({ op: "nop" })).toEqual({ ok: true });
  });

  test("keeps the worker referenced while an operation is pending", async () => {
    let worker;
    let ref;
    let unref;
    const resourceWorker = new ResourceWorker(() => {
      worker = new Worker(new URL("./nop-worker.js", import.meta.url));
      ref = vi.spyOn(worker, "ref");
      unref = vi.spyOn(worker, "unref");
      return worker;
    });

    const result = resourceWorker.run({ op: "delay" });
    expect(ref).toHaveBeenCalledOnce();
    expect(unref).toHaveBeenCalledOnce();
    await expect(result).resolves.toEqual({ ok: true });
    expect(unref).toHaveBeenCalledTimes(2);
    resourceWorker.terminate();
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
