import { expect, test } from "vitest";
import { encode, decode } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls/wire.js";

test.concurrent("wire metadata retains certificate cycles, views, errors and undefined", () => {
  const value: Record<string, unknown> = {
    raw: new Uint8Array([0, 1, 2]).subarray(1),
    absent: undefined,
    error: Object.assign(new TypeError("bad option"), { code: "ERR_TEST" }),
  };
  value.issuerCertificate = value;
  const result = decode(encode(value)) as typeof value;
  expect(result.issuerCertificate).toBe(result);
  expect(result.raw).toEqual(Buffer.from([1, 2]));
  expect(result).toHaveProperty("absent", undefined);
  expect(result.error).toBeInstanceOf(TypeError);
  expect(result.error).toMatchObject({ message: "bad option", code: "ERR_TEST" });
});

test.concurrent.each([NaN, Infinity, -Infinity, -0])(
  "wire preserves numeric validation input %s",
  (value) => {
    expect(Object.is(decode(encode(value)), value)).toBe(true);
  },
);
