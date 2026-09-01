import { describe, expect, test } from "vitest";

import {
  from,
  fromSync,
  pipeTo,
  pipeToSync,
  type ByteBatch,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

describe("stream/iter pipeTo", () => {
  test("uses batch writes, closes, and reports byte count", async () => {
    const chunks: ByteBatch = [];
    let ended = false;
    const count = await pipeTo(from(["ab", "c"]), {
      async write(chunk: Uint8Array): Promise<void> {
        chunks.push(chunk);
      },
      async writev(batch: ByteBatch): Promise<void> {
        chunks.push(...batch);
      },
      async end(): Promise<number> {
        ended = true;
        return 0;
      },
    });
    expect(count).toBe(3);
    expect(new TextDecoder().decode(Uint8Array.from(chunks.flatMap((chunk) => [...chunk])))).toBe(
      "abc",
    );
    expect(ended).toBe(true);
  });

  test("supports synchronous writers and preventClose", () => {
    const chunks: ByteBatch = [];
    let ended = false;
    const count = pipeToSync(
      fromSync("abc"),
      {
        writeSync(chunk: Uint8Array): boolean {
          chunks.push(chunk);
          return true;
        },
        endSync(): number {
          ended = true;
          return 0;
        },
      },
      { preventClose: true },
    );
    expect(count).toBe(3);
    expect(ended).toBe(false);
  });

  test("fails the destination when a source throws", async () => {
    const failure = new Error("source failed");
    let received: unknown;
    async function* source(): AsyncIterable<string> {
      throw failure;
    }
    await expect(
      pipeTo(from(source()), {
        async write(): Promise<void> {},
        fail(reason: unknown): void {
          received = reason;
        },
      }),
    ).rejects.toBe(failure);
    expect(received).toBe(failure);
  });
});
