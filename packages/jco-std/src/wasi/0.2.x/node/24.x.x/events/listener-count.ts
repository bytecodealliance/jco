import type { EventsCore } from "./types.js";

/**
 * `events.listenerCount(emitter, eventName)`.
 *
 * Deprecated in Node in favour of `emitter.listenerCount()`, but still present and still used, so
 * it is implemented rather than refused. unenv ships it as a `notImplemented` stub that throws.
 *
 * Follows Node: delegate to the emitter's own method when it has one, so subclasses that override
 * counting are honoured, and otherwise apply the core implementation to the object.
 *
 * @param core - the emitter core to fall back to
 */
export function createListenerCount(core: EventsCore) {
  return function listenerCount(
    emitter: { listenerCount?: unknown },
    eventName: string | symbol,
  ): number {
    if (typeof emitter?.listenerCount === "function") {
      return (emitter.listenerCount as (type: string | symbol) => number).call(emitter, eventName);
    }
    return core.EventEmitter.prototype.listenerCount.call(emitter, eventName);
  };
}
