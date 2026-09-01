import { describe, expect, test } from "vitest";

import {
  array,
  arrayBuffer,
  arrayBufferSync,
  arraySync,
  bytes,
  bytesSync,
  from,
  fromSync,
  text,
  textSync,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

describe("stream/iter consumers", () => {
  test("collects every sync and async result shape", async () => {
    expect(new TextDecoder().decode(await bytes(from(["a", "b"])))).toBe("ab");
    expect(new TextDecoder().decode(bytesSync(fromSync(["a", "b"])))).toBe("ab");
    expect(new TextDecoder().decode(await arrayBuffer(from("ab")))).toBe("ab");
    expect(new TextDecoder().decode(arrayBufferSync(fromSync("ab")))).toBe("ab");
    expect((await array(from(["a", "b"]))).map((chunk) => new TextDecoder().decode(chunk))).toEqual(
      ["a", "b"],
    );
    expect(arraySync(fromSync(["a", "b"]))).toHaveLength(2);
    expect(await text(from("hello"))).toBe("hello");
    expect(textSync(fromSync("hello"))).toBe("hello");
  });

  test("enforces byte limits", async () => {
    await expect(bytes(from("abcd"), { limit: 3 })).rejects.toMatchObject({
      code: "ERR_OUT_OF_RANGE",
    });
    expect(() => bytesSync(fromSync("abcd"), { limit: 3 })).toThrow(
      expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
    );
  });

  test("validates encodings and decodes fatally", async () => {
    await expect(text(from("ok"), { encoding: "not-an-encoding" })).rejects.toMatchObject({
      code: "ERR_INVALID_ARG_VALUE",
    });
    await expect(text(from(new Uint8Array([0xff])))).rejects.toBeInstanceOf(TypeError);
  });

  test("observes abort before and during consumption", async () => {
    const before = AbortSignal.abort(new Error("before"));
    await expect(bytes(from("x"), { signal: before })).rejects.toThrow("before");

    const controller = new AbortController();
    async function* source(): AsyncIterable<string> {
      yield "a";
      await new Promise(() => {});
    }
    const pending = bytes(from(source()), { signal: controller.signal });
    controller.abort(new Error("during"));
    await expect(pending).rejects.toThrow("during");
  });
});
