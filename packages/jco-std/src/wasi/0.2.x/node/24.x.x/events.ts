/**
 * The parts of `node:events` Jco implements itself.
 *
 * Unlike jco-std's other Node entry points this is not a drop-in module: `node:events` is served
 * to guests by unenv's `EventEmitter`, which is faithful to Node. Three module-level functions are
 * not -- `listenerCount` and `setMaxListeners` are `notImplemented` stubs that throw when called,
 * and `getMaxListeners` throws when handed an `EventTarget` rather than an emitter.
 *
 * Rather than admit a module that fails at runtime, Jco composes the two: the plugin passes unenv's
 * core to `completeEvents` and exports the result in place of the stubs. jco-std takes no
 * dependency on unenv -- the core arrives as an argument.
 */

export { completeEvents } from "./events/index.js";
export type { EmitterLike, EventsCore, ListenerTarget } from "./events/index.js";
