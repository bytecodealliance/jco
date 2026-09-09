import { describe, expect, test } from "vitest";

import { json, text } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/consumers.js";

describe("node:stream/consumers text consumers", () => {
  test.concurrent("consumes Web readers even when the engine lacks async iteration", async () => {
    const source = new ReadableStream({
      start(controller): void {
        controller.enqueue(new Uint8Array([65]));
        controller.close();
      },
    });
    Object.defineProperty(source, Symbol.asyncIterator, { value: undefined });
    await expect(text(source)).resolves.toBe("A");
    expect(source.locked).toBe(false);
  });

  test.concurrent("cancels and releases Web readers when decoding a chunk fails", async () => {
    let canceled = false;
    const source = new ReadableStream({
      start(controller): void {
        controller.enqueue({ invalid: true });
      },
      cancel(): void {
        canceled = true;
      },
    });
    await expect(text(source)).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
    expect(canceled).toBe(true);
    expect(source.locked).toBe(false);
  });
  test.concurrent("streams split UTF-8 sequences and preserves string chunks", async () => {
    const encoded = new TextEncoder().encode("A🙂B");
    expect(await text([encoded.slice(0, 3), encoded.slice(3), "!"])).toBe("A🙂B!");
  });

  test.concurrent("parses JSON and propagates SyntaxError", async () => {
    await expect(json(['{"ok":', "true}"])).resolves.toEqual({ ok: true });
    await expect(json(["{"])).rejects.toBeInstanceOf(SyntaxError);
  });

  test.concurrent("rejects non-stream inputs and invalid binary chunks explicitly", async () => {
    await expect(text(1 as never)).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
    await expect(text([{}])).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
  });
});
