/** Shared types for the `node:events` entry points Jco implements over an existing emitter core. */

/** The subset of `EventEmitter.prototype` these entry points need. */
export interface EmitterLike {
  listenerCount(type: string | symbol, listener?: unknown): number;
  setMaxListeners(n: number): unknown;
  getMaxListeners(): number;
}

/**
 * The emitter core these entry points are layered onto.
 *
 * Jco supplies unenv's `node:events`, whose `EventEmitter` is faithful; only the module-level
 * functions below are missing from it. Taking the core as a parameter is what keeps jco-std free
 * of any dependency on unenv.
 */
export interface EventsCore {
  EventEmitter: {
    defaultMaxListeners: number;
    prototype: EmitterLike;
  };
}

/** Anything `setMaxListeners`/`getMaxListeners` accept: an `EventEmitter` or an `EventTarget`. */
export type ListenerTarget = Partial<EmitterLike> | EventTarget;
