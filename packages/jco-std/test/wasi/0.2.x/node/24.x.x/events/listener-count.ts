import * as nodeEvents from "node:events";
import { EventEmitter, listenerCount as nodeListenerCount } from "node:events";

import { describe, expect, test } from "vitest";

import { completeEvents } from "../../../../../../src/wasi/0.2.x/node/24.x.x/events/index.js";

/**
 * Node's own `node:events` satisfies the core contract, so the implementation can be layered onto
 * it and compared against Node's function over the same emitters. Any divergence is then in the
 * implementation rather than in the emitter underneath it.
 */
const { listenerCount } = completeEvents(nodeEvents);

describe("listenerCount", () => {
  test("counts registered listeners", () => {
    const emitter = new EventEmitter();
    emitter.on("x", () => {});
    emitter.on("x", () => {});
    expect(listenerCount(emitter, "x")).toBe(nodeListenerCount(emitter, "x"));
    expect(listenerCount(emitter, "x")).toBe(2);
  });

  test("is zero for an event with no listeners", () => {
    const emitter = new EventEmitter();
    expect(listenerCount(emitter, "missing")).toBe(nodeListenerCount(emitter, "missing"));
    expect(listenerCount(emitter, "missing")).toBe(0);
  });

  test("counts symbol-keyed events", () => {
    const emitter = new EventEmitter();
    const key = Symbol("event");
    emitter.on(key, () => {});
    expect(listenerCount(emitter, key)).toBe(nodeListenerCount(emitter, key));
  });

  test("counts a once listener until it fires", () => {
    const emitter = new EventEmitter();
    emitter.once("x", () => {});
    expect(listenerCount(emitter, "x")).toBe(1);
    emitter.emit("x");
    expect(listenerCount(emitter, "x")).toBe(0);
  });

  test("defers to an emitter that overrides listenerCount", () => {
    // Node delegates to the emitter's own method, so a subclass that counts differently is
    // honoured rather than bypassed.
    class Counted extends EventEmitter {
      override listenerCount(): number {
        return 99;
      }
    }
    const emitter = new Counted();
    expect(listenerCount(emitter, "x")).toBe(nodeListenerCount(emitter, "x"));
    expect(listenerCount(emitter, "x")).toBe(99);
  });
});
