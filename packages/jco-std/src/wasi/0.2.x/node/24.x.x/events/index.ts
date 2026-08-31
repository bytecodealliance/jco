import { createListenerCount } from "./listener-count.js";
import { createMaxListeners } from "./max-listeners.js";
import type { EventsCore } from "./types.js";

export { invalidArgInstance, invalidArgType, outOfRange } from "./errors.js";
export type { EmitterLike, EventsCore, ListenerTarget } from "./types.js";

/**
 * Complete an emitter core with the module-level functions it is missing.
 *
 * Jco's `node:events` is unenv's `EventEmitter` plus these three. `EventEmitter` itself, `once`,
 * `on`, `getEventListeners`, `addAbortListener` and `EventEmitterAsyncResource` all match Node
 * already and are re-exported untouched.
 *
 * @param core - the emitter core to complete
 * @returns the entry points to layer over it, each matching Node 24
 */
export function completeEvents(core: EventsCore) {
  return {
    listenerCount: createListenerCount(core),
    ...createMaxListeners(core),
  };
}
