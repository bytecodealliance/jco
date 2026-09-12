import { expect, test } from "vitest";
import { v8, unsupportedError } from "../helpers/v8.js";

test("refuses to misreport the representation of a transported string", () => {
  expect(() => v8.isStringOneByteRepresentation("ascii")).toThrow(
    expect.objectContaining(unsupportedError),
  );
});
