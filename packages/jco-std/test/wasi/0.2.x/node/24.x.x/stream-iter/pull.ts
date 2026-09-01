import { describe, expect, test } from "vitest";

import {
  from,
  fromSync,
  pull,
  pullSync,
  tap,
  tapSync,
  text,
  textSync,
  type ByteBatch,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

const upper = (batch: ByteBatch | null): ByteBatch | null =>
  batch?.map((chunk) => chunk.map((byte) => (byte >= 97 && byte <= 122 ? byte - 32 : byte))) ??
  null;

describe("stream/iter pull pipelines", () => {
  test("applies async stateless transforms in order and flushes", async () => {
    const seen: number[] = [];
    const result = pull(
      from("ab"),
      tap((batch) => {
        seen.push(batch?.length ?? 0);
        return batch;
      }),
      upper,
      (batch) => (batch === null ? "!" : batch),
    );
    expect(await text(result)).toBe("AB!");
    expect(seen).toEqual([1, 0]);
  });

  test("applies synchronous transforms", () => {
    const seen: number[] = [];
    const result = pullSync(
      fromSync("ab"),
      tapSync((batch) => {
        seen.push(batch?.length ?? 0);
        return batch;
      }),
      upper,
    );
    expect(textSync(result)).toBe("AB");
    expect(seen).toEqual([1, 0]);
  });

  test("supports stateful transform objects", async () => {
    const transform = {
      async *transform(source: AsyncIterable<ByteBatch | null>): AsyncIterable<string> {
        let count = 0;
        for await (const batch of source) {
          if (batch === null) {
            yield String(count);
          } else {
            count += batch.length;
            yield batch;
          }
        }
      },
    };
    expect(await text(pull(from(["a", "b"]), transform))).toBe("ab2");
  });
});
