import { expect, test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";
import {
  compareOutcome,
  describeDifferential,
  expectAssertion,
  nodeAssert,
} from "../helpers/assert.js";

describeDifferential("assert.ok", () => {
  test.each([true, 1, "value", {}, [], Symbol("value")])("accepts truthy value %s", (value) => {
    compareOutcome(
      () => assert.ok(value),
      () => nodeAssert.ok(value),
    );
  });

  test.each([false, 0, -0, "", null, undefined, Number.NaN])("rejects falsy value %s", (value) => {
    compareOutcome(
      () => assert.ok(value),
      () => nodeAssert.ok(value),
    );
  });

  test("throws a supplied Error unchanged", () => {
    const error = new TypeError("custom");
    expect(() => assert.ok(false, error)).toThrow(error);
  });

  test("distinguishes an omitted argument", () => {
    expectAssertion(() => Reflect.apply(assert.ok, undefined, [])).message.includes(
      "No value argument",
    );
  });
});
