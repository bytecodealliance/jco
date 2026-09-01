import { describe, expect, test } from "vitest";

import {
  arrayBuffer,
  blob,
  buffer,
  bytes,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/consumers.js";

async function* chunks(): AsyncIterable<Uint8Array | string> {
  yield "hello ";
  yield new Uint8Array([119, 111, 114, 108, 100]);
}

describe("node:stream/consumers binary consumers", () => {
  test("collects ArrayBuffer, Uint8Array, Buffer, and Blob results", async () => {
    expect(new TextDecoder().decode(await arrayBuffer(chunks()))).toBe("hello world");
    expect(new TextDecoder().decode(await bytes(chunks()))).toBe("hello world");
    expect((await buffer(chunks())).toString()).toBe("hello world");
    expect(await (await blob(chunks())).text()).toBe("hello world");
  });

  test("handles empty streams", async () => {
    expect((await arrayBuffer([])).byteLength).toBe(0);
    expect((await bytes([])).byteLength).toBe(0);
    expect((await buffer([])).byteLength).toBe(0);
    expect((await blob([])).size).toBe(0);
  });
});
