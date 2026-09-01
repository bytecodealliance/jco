import { describe, expect, test } from "vitest";

import {
  ondrain,
  push,
  text,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

describe("stream/iter push", () => {
  test("connects writer and readable with lifecycle accounting", async () => {
    const { writer, readable } = push();
    const consuming = text(readable);
    await writer.write("hello");
    await writer.writev([" ", "world"]);
    expect(await writer.end()).toBe(11);
    expect(await consuming).toBe("hello world");
    expect(writer.desiredSize).toBeNull();
  });

  test("reports synchronous backpressure and drains after consumption", async () => {
    const { writer, readable } = push();
    expect(writer.writeSync(new Uint8Array(16_384))).toBe(true);
    expect(writer.writeSync("x")).toBe(false);
    const draining = ondrain(writer);
    const iterator = readable[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.[0].byteLength).toBe(16_384);
    await expect(draining).resolves.toBe(true);
    await writer.end();
  });

  test("implements dropping policies and propagates failure", async () => {
    const newest = push({ backpressure: "drop-newest" });
    newest.writer.writeSync(new Uint8Array(16_384));
    expect(newest.writer.writeSync("dropped")).toBe(true);
    newest.writer.endSync();
    expect((await text(newest.readable)).length).toBe(16_384);

    const failed = push();
    failed.writer.fail(new Error("failed"));
    await expect(text(failed.readable)).rejects.toThrow("failed");
  });

  test("rejects invalid budgets and writes after end", () => {
    expect(() => push({ budget: 1 })).toThrow(
      expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
    );
    const { writer } = push();
    writer.endSync();
    expect(() => writer.writeSync("late")).toThrow(
      expect.objectContaining({ code: "ERR_STREAM_WRITE_AFTER_END" }),
    );
  });
});
