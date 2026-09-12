import { expect, test } from "vitest";
import native from "node:v8";
import { Buffer } from "node:buffer";
import { v8, blocked, deniedError, unsupportedError } from "../helpers/v8.js";

test("produces native binary data for primitives and structured graphs", () => {
  const shared = { value: 42 };
  const cycle: Record<string, unknown> = { shared, alias: shared };
  cycle.self = cycle;
  const backing = new ArrayBuffer(16);
  const values = [
    undefined,
    null,
    -0,
    NaN,
    Infinity,
    -Infinity,
    123n,
    "hello 💚",
    cycle,
    new Map([[shared, shared]]),
    new Set([shared]),
    new Date(NaN),
    /hello/gi,
    new Uint32Array(backing, 4, 2),
    new DataView(backing, 3, 4),
    Buffer.from([1, 2, 3]),
  ];

  for (const value of values) {
    const encoded = v8.serialize(value);
    expect(Buffer.isBuffer(encoded)).toBe(true);
    expect(native.deserialize(encoded)).toEqual(native.deserialize(native.serialize(value)));
  }

  expect(() => blocked.serialize({})).toThrow(expect.objectContaining(deniedError));
});

test("refuses unsupported values without running accessors or toJSON", () => {
  let accessed = false;
  const value = {
    get field() {
      accessed = true;
      return 1;
    },
  };
  expect(() => v8.serialize(value)).toThrow(expect.objectContaining(unsupportedError));
  expect(accessed).toBe(false);
  expect(() => v8.serialize(new Error("unportable"))).toThrow(
    expect.objectContaining(unsupportedError),
  );
  expect(() => v8.serialize(() => 1)).toThrow();
});
