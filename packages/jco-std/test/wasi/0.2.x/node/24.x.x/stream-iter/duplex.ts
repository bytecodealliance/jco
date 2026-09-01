import { describe, expect, test } from "vitest";

import { duplex, text } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

describe("stream/iter duplex", () => {
  test("connects each writer to the opposite readable", async () => {
    const [a, b] = duplex();
    const fromA = text(b.readable);
    const fromB = text(a.readable);
    await a.writer.write("a-to-b");
    await b.writer.write("b-to-a");
    await Promise.all([a.close(), b.close()]);
    await expect(Promise.all([fromA, fromB])).resolves.toEqual(["a-to-b", "b-to-a"]);
  });
});
