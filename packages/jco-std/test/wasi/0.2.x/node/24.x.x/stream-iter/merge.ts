import { describe, expect, test } from "vitest";

import { merge, text } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

describe("stream/iter merge", () => {
  test("emits batches as their sources become ready", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* slow(): AsyncIterable<string> {
      await blocked;
      yield "slow";
    }

    const output = text(merge(slow(), "fast"));
    await Promise.resolve();
    release();

    expect(await output).toBe("fastslow");
  });

  test("supports empty input and cancellation", async () => {
    expect(await text(merge())).toBe("");

    const signal = AbortSignal.abort(new Error("stop"));
    await expect(text(merge("unread", { signal }))).rejects.toThrow("stop");
  });

  test("propagates source failures", async () => {
    async function* failing(): AsyncIterable<string> {
      yield "before";
      throw new Error("source failed");
    }

    await expect(text(merge(failing()))).rejects.toThrow("source failed");
  });
});
