import { expect, test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.throws", () => {
  test("supports no matcher, constructors, regexps, predicates, and objects", () => {
    const cases: Array<[() => unknown, Parameters<typeof assert.throws>[1]]> = [
      [
        () => {
          throw new Error("boom");
        },
        undefined,
      ],
      [
        () => {
          throw new TypeError("boom");
        },
        TypeError,
      ],
      [
        () => {
          throw new Error("boom");
        },
        /boom/,
      ],
      [
        () => {
          throw { code: "E_TEST" };
        },
        { code: "E_TEST" },
      ],
      [
        () => {
          throw 42;
        },
        (value: unknown) => value === 42,
      ],
    ];
    for (const [block, matcher] of cases) {
      compareOutcome(
        () => (matcher === undefined ? assert.throws(block) : assert.throws(block, matcher)),
        () =>
          matcher === undefined ? nodeAssert.throws(block) : nodeAssert.throws(block, matcher),
      );
    }
  });

  test("reports missing and mismatched exceptions", () => {
    compareOutcome(
      () => assert.throws(() => undefined),
      () => nodeAssert.throws(() => undefined),
    );
    compareOutcome(
      () =>
        assert.throws(() => {
          throw new Error("first");
        }, /second/),
      () =>
        nodeAssert.throws(() => {
          throw new Error("first");
        }, /second/),
    );
  });

  test("rejects an ambiguous string message", () => {
    expect(() =>
      assert.throws(() => {
        throw new Error("same");
      }, "same"),
    ).toThrowError(expect.objectContaining({ code: "ERR_AMBIGUOUS_ARGUMENT" }));
  });
});
