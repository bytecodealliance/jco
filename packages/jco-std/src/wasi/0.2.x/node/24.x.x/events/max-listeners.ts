import { invalidArgInstance, invalidArgType, outOfRange } from "./errors.js";
import type { EventsCore, ListenerTarget } from "./types.js";

/**
 * Per-`EventTarget` listener limits.
 *
 * Node stores this on the target under an internal symbol. Nothing outside `node:events` may
 * observe it, so a `WeakMap` keyed by the target is equivalent and does not mutate objects the
 * caller owns.
 */
const eventTargetLimits = new WeakMap<EventTarget, number>();

/** Node accepts anything with `addEventListener`/`removeEventListener` as an `EventTarget`. */
function isEventTarget(value: unknown): value is EventTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EventTarget).addEventListener === "function" &&
    typeof (value as EventTarget).removeEventListener === "function"
  );
}

/** Node's `validateNumber(n, name, 0)`: a number, and not negative or `NaN`. */
function validateLimit(n: unknown): asserts n is number {
  if (typeof n !== "number") {
    throw invalidArgType("setMaxListeners", "number", n);
  }
  if (Number.isNaN(n) || n < 0) {
    throw outOfRange("setMaxListeners", ">= 0", n);
  }
}

/**
 * `events.setMaxListeners()` and `events.getMaxListeners()`.
 *
 * unenv ships `setMaxListeners` as a `notImplemented` stub, and its `getMaxListeners` throws on an
 * `EventTarget` because it only handles emitters. Both are implemented here against Node's
 * behavior; the emitter half delegates to the core rather than reimplementing it.
 *
 * @param core - the emitter core supplying `defaultMaxListeners`
 */
export function createMaxListeners(core: EventsCore) {
  /**
   * `events.setMaxListeners(n[, ...eventTargets])`.
   *
   * With no targets this sets the default for emitters created afterwards; with targets it sets
   * the limit on each one, accepting both `EventEmitter`s and `EventTarget`s.
   */
  function setMaxListeners(
    n: number = core.EventEmitter.defaultMaxListeners,
    ...eventTargets: ListenerTarget[]
  ): void {
    validateLimit(n);
    if (eventTargets.length === 0) {
      core.EventEmitter.defaultMaxListeners = n;
      return;
    }
    for (const target of eventTargets) {
      if (isEventTarget(target)) {
        eventTargetLimits.set(target, n);
      } else if (typeof (target as { setMaxListeners?: unknown })?.setMaxListeners === "function") {
        (target as { setMaxListeners: (n: number) => unknown }).setMaxListeners(n);
      } else {
        throw invalidArgInstance("eventTargets", ["EventEmitter", "EventTarget"], target);
      }
    }
  }

  /** `events.getMaxListeners(emitterOrEventTarget)`. */
  function getMaxListeners(emitterOrEventTarget: ListenerTarget): number {
    if (
      typeof (emitterOrEventTarget as { getMaxListeners?: unknown })?.getMaxListeners === "function"
    ) {
      return (emitterOrEventTarget as { getMaxListeners: () => number }).getMaxListeners();
    }
    if (isEventTarget(emitterOrEventTarget)) {
      return eventTargetLimits.get(emitterOrEventTarget) ?? core.EventEmitter.defaultMaxListeners;
    }
    throw invalidArgInstance("emitter", ["EventEmitter", "EventTarget"], emitterOrEventTarget);
  }

  return { getMaxListeners, setMaxListeners };
}
