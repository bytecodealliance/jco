import * as nodeEvents from "node:events";
import {
  EventEmitter,
  getMaxListeners as nodeGetMaxListeners,
  setMaxListeners as nodeSetMaxListeners,
} from "node:events";

import { afterEach, describe, expect, test } from "vitest";

import { completeEvents } from "../../../../../../src/wasi/0.2.x/node/24.x.x/events/index.js";

const { getMaxListeners, setMaxListeners } = completeEvents(nodeEvents);

// `setMaxListeners()` with no targets mutates the shared default, which would leak into later
// tests and into Node's own emitters.
const ORIGINAL_DEFAULT = EventEmitter.defaultMaxListeners;
afterEach(() => {
  EventEmitter.defaultMaxListeners = ORIGINAL_DEFAULT;
});

describe("setMaxListeners", () => {
  test("sets the limit on an emitter", () => {
    const mine = new EventEmitter();
    const theirs = new EventEmitter();
    setMaxListeners(7, mine);
    nodeSetMaxListeners(7, theirs);
    expect(mine.getMaxListeners()).toBe(theirs.getMaxListeners());
    expect(mine.getMaxListeners()).toBe(7);
  });

  test("sets the limit on an EventTarget", () => {
    const target = new EventTarget();
    setMaxListeners(4, target);
    expect(getMaxListeners(target)).toBe(4);
  });

  test("accepts emitters and EventTargets together", () => {
    const emitter = new EventEmitter();
    const target = new EventTarget();
    setMaxListeners(5, emitter, target);
    expect([getMaxListeners(emitter), getMaxListeners(target)]).toEqual([5, 5]);
  });

  test("with no targets sets the default for emitters made afterwards", () => {
    setMaxListeners(3);
    expect(EventEmitter.defaultMaxListeners).toBe(3);
    expect(new EventEmitter().getMaxListeners()).toBe(3);
  });

  test("defaults its argument to the current default", () => {
    EventEmitter.defaultMaxListeners = 6;
    const emitter = new EventEmitter();
    setMaxListeners(undefined, emitter);
    expect(emitter.getMaxListeners()).toBe(6);
  });

  const rejected: [string, unknown, string][] = [
    ["a non-number limit", "nope", "ERR_INVALID_ARG_TYPE"],
    ["a negative limit", -1, "ERR_OUT_OF_RANGE"],
    ["NaN", Number.NaN, "ERR_OUT_OF_RANGE"],
  ];
  test.each(rejected)("rejects %s exactly as Node does", (_name, value, code) => {
    const mine = () => setMaxListeners(value as number);
    const theirs = () => nodeSetMaxListeners(value as number);
    expect(mine).toThrowError(expect.objectContaining({ code }));
    expect(theirs).toThrowError(expect.objectContaining({ code }));
    expect(errorFrom(mine).message).toBe(errorFrom(theirs).message);
  });

  test("rejects a target that is neither an emitter nor an EventTarget", () => {
    const mine = () => setMaxListeners(1, {} as EventTarget);
    const theirs = () => nodeSetMaxListeners(1, {} as EventTarget);
    expect(mine).toThrowError(expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }));
    expect(errorFrom(mine).message).toBe(errorFrom(theirs).message);
  });
});

describe("getMaxListeners", () => {
  test("reads an emitter's limit", () => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(9);
    expect(getMaxListeners(emitter)).toBe(nodeGetMaxListeners(emitter));
    expect(getMaxListeners(emitter)).toBe(9);
  });

  test("reads an untouched EventTarget as the current default", () => {
    const target = new EventTarget();
    expect(getMaxListeners(target)).toBe(nodeGetMaxListeners(target));
    expect(getMaxListeners(target)).toBe(EventEmitter.defaultMaxListeners);
  });

  const rejected: [string, unknown][] = [
    ["a plain object", {}],
    ["null", null],
    ["undefined", undefined],
  ];
  test.each(rejected)("rejects %s exactly as Node does", (_name, value) => {
    const mine = () => getMaxListeners(value as EventTarget);
    const theirs = () => nodeGetMaxListeners(value as EventTarget);
    expect(mine).toThrowError(expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }));
    expect(errorFrom(mine).message).toBe(errorFrom(theirs).message);
  });
});

/** Run a thunk that is expected to throw, and hand back the error it threw. */
function errorFrom(run: () => unknown): Error & { code?: string } {
  try {
    run();
  } catch (error) {
    return error as Error & { code?: string };
  }
  throw new Error("expected the call to throw");
}
