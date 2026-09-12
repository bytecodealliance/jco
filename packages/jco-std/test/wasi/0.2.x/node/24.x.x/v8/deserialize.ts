import { expect, test } from "vitest";
import native from "node:v8";
import { Buffer } from "node:buffer";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("reads native buffers, typed views, and the upstream version-13 cyclic fixture", () => {
  const encoded = native.serialize({ value: [1, 2, 3], buffer: Buffer.from("hello") });
  const padded = Buffer.concat([Buffer.from([0]), encoded, Buffer.from([0])]);
  expect(
    v8.deserialize(new DataView(padded.buffer, padded.byteOffset + 1, encoded.length)),
  ).toEqual(native.deserialize(encoded));

  // Fixture from Node v24.20.0 test/parallel/test-v8-serdes.js (MIT),
  // commit 71b8b174857e25106d39b61a9e6f30d927da8b01: an older cyclic wire format.
  const cycle = v8.deserialize(Buffer.from("ff0d6f2203666f6f5e007b01", "hex")) as { foo: unknown };
  expect(cycle.foo).toBe(cycle);
  expect(() => v8.deserialize(Buffer.from("invalid"))).toThrow(/deserialize/);
  expect(() => Reflect.apply(v8.deserialize, null, ["invalid"])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
  );
  expect(() => blocked.deserialize(encoded)).toThrow(expect.objectContaining(deniedError));
});
