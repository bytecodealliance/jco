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

  test("sync run err", () => {
    expect(() => _worker.runSync({ op: "err" })).toThrow("err");
  });
});
