import { expect, test } from "vitest";
import { mock as native } from "node:test";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("mock.fn preserves this, arguments, results, errors, and times like Node", () => {
  const observations: unknown[] = [];
  const original = function (this: { base: number }, a: number): number {
    return this.base + a;
  };
  const implementation = function (a: number): number {
    if (a < 0) {
      throw new Error("negative");
    }
    return a * 2;
  };
  const tracker = new MockTracker();
  const mocks = [
    tracker.fn(original, implementation, { times: 2 }),
    native.fn(original, implementation, { times: 2 }),
  ];
  for (const fn of mocks) {
    const object = { base: 10, fn };
    expect(object.fn(2)).toBe(4);
    expect(() => object.fn(-1)).toThrow("negative");
    expect(object.fn(2)).toBe(12);
    observations.push(
      fn.mock.calls.map((call) => ({
        args: call.arguments,
        result: call.result,
        error: call.error instanceof Error ? call.error.message : undefined,
        receiver: call.this === object,
        stack: call.stack instanceof Error,
        target: call.target,
      })),
    );
  }
  tracker.reset();
  native.reset();
  expect(observations[0]).toEqual(observations[1]);
});
test("fn overloads and invalid options", () => {
  const tracker = new MockTracker();
  expect(tracker.fn()()).toBeUndefined();
  expect(tracker.fn({ times: 1 })()).toBeUndefined();
  expect(tracker.fn((): number => 3, { times: 1 })()).toBe(3);
  expect(() => tracker.fn({ times: 0 })).toThrow(/options.times/);
});
test("constructor mocks retain constructibility, prototypes and typed results", () => {
  class Value {
    constructor(readonly value: number) {}
  }
  const tracker = new MockTracker();
  const MockValue = tracker.fn(Value);
  const instance = new MockValue(7);
  expect(instance).toBeInstanceOf(Value);
  expect(instance.value).toBe(7);
  const result: Value | undefined = MockValue.mock.calls[0].result;
  expect(result).toBe(instance);
  expect(MockValue.mock.calls[0].target).toBe(Value);
  expect(MockValue.mock.calls[0].this).toBe(instance);
  expect(MockValue.mock.calls[0].arguments).toEqual([7]);
});
