import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("property contexts reset history, validate indices and reject readonly writes", () => {
  const tracker = new MockTracker();
  const object = { value: 1 };
  const proxy = tracker.property(object, "value");
  expect(proxy.value).toBe(1);
  const accesses = proxy.mock.accesses;
  accesses.pop();
  expect(proxy.mock.accessCount()).toBe(1);
  expect(() => proxy.mock.mockImplementationOnce(3, 0)).toThrow(/onAccess/);
  proxy.mock.resetAccesses();
  expect(proxy.mock.accessCount()).toBe(0);
  proxy.mock.restore();
  expect(object.value).toBe(1);
  const readonly = Object.defineProperty({}, "value", {
    configurable: true,
    writable: false,
    value: 1,
  }) as { value: number };
  const frozen = tracker.property(readonly, "value");
  expect(() => frozen.mock.mockImplementation(2)).toThrow(/cannot be set/);
});
