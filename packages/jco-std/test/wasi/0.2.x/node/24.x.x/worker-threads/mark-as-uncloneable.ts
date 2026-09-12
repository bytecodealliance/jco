import { expect, test } from "vitest";
import { createMessageCodec } from "../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads/codec.js";

test("markAsUncloneable rejects nested marked objects before delivery", () => {
  const codec = createMessageCodec();
  const object = {};
  codec.markAsUncloneable(object);
  expect(() => codec.encode({ nested: object })).toThrow(
    expect.objectContaining({ name: "DataCloneError" }),
  );
  for (const value of [null, undefined, 1, "a"]) {
    codec.markAsUncloneable(value);
  }
  const bytes = new ArrayBuffer(2);
  codec.markAsUncloneable(bytes);
  expect(() => codec.encode(bytes)).not.toThrow();
});

test("Node built-in value serializers ignore clone marks", () => {
  const codec = createMessageCodec();
  for (const value of [
    [],
    new Map(),
    new Set(),
    new Date(),
    /x/,
    new Uint8Array(2),
    new DataView(new ArrayBuffer(2)),
  ]) {
    codec.markAsUncloneable(value);
    expect(() => codec.encode(value)).not.toThrow();
  }
});
