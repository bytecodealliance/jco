import { expect, test } from "vitest";
import { v8, unsupportedError } from "../helpers/v8.js";

test("does not query a different heap or inspect the constructor", () => {
  const ctor = new Proxy(function Example() {}, {
    get() {
      throw new Error("must not inspect");
    },
  });
  expect(() => v8.queryObjects(ctor)).toThrow(expect.objectContaining(unsupportedError));
  expect(() => v8.queryObjects(ctor, { format: "summary" })).toThrow(
    expect.objectContaining(unsupportedError),
  );
});
