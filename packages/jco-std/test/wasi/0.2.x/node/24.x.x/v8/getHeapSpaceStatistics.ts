import { expect, test } from "vitest";
import native from "node:v8";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("returns real heap spaces with native record shapes", () => {
  const spaces = v8.getHeapSpaceStatistics();
  expect(spaces.map((space) => space.space_name)).toEqual(
    native.getHeapSpaceStatistics().map((space) => space.space_name),
  );
  expect(spaces.some((space) => space.space_used_size > 0)).toBe(true);
  expect(Object.keys(spaces[0])).toEqual(Object.keys(native.getHeapSpaceStatistics()[0]));
  expect(() => blocked.getHeapSpaceStatistics()).toThrow(expect.objectContaining(deniedError));
});
