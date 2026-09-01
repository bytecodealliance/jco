import { describe, expect, test } from "vitest";

import { json, text } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/consumers.js";

describe("node:stream/consumers text consumers", () => {
  test("streams split UTF-8 sequences and preserves string chunks", async () => {
    const encoded = new TextEncoder().encode("A🙂B");
    expect(await text([encoded.slice(0, 3), encoded.slice(3), "!"])).toBe("A🙂B!");
  });

  test("parses JSON and propagates SyntaxError", async () => {
    await expect(json(['{"ok":', "true}"])).resolves.toEqual({ ok: true });
    await expect(json(["{"])).rejects.toBeInstanceOf(SyntaxError);
  });

  test("rejects non-stream inputs and invalid binary chunks explicitly", async () => {
    await expect(text(1 as never)).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
    await expect(text([{}])).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
  });
});
