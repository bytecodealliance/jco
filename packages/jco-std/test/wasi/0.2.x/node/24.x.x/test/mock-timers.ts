import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("native timer mocks reject before reading options or changing globals", () => {
  const tracker = new MockTracker();
  const originalDate = Date;
  const originalTimeout = setTimeout;
  let read = false;
  expect(() =>
    tracker.timers.enable({
      get apis(): [] {
        read = true;
        throw new Error("getter");
      },
    }),
  ).toThrow(/shared Node timer internals/);
  expect(() => tracker.timers.tick()).toThrow(/not supported/);
  expect(() => tracker.timers.runAll()).toThrow(/not supported/);
  expect(() => tracker.timers.setTime(1)).toThrow(/not supported/);
  tracker.timers.reset();
  tracker.timers[Symbol.dispose]();
  expect(read).toBe(false);
  expect(Date).toBe(originalDate);
  expect(setTimeout).toBe(originalTimeout);
  expect(() => Reflect.apply(tracker.timers.enable, tracker.timers, [[]])).toThrow(/deprecated/);
});
