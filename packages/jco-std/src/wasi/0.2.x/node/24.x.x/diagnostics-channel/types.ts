/** A subscriber, called with the published message and the channel's name. */
export type MessageHandler = (message: unknown, name: string) => void;

/**
 * The store contract `bindStore` needs.
 *
 * Structural on purpose: it accepts jco-std's `AsyncLocalStorage`, Node's own, or anything else
 * offering `run`, so this module takes no dependency on a particular storage implementation.
 */
export interface BoundStore {
  run<R>(store: unknown, fn: () => R): R;
}

/** Transforms published data into the value a bound store should hold. */
export type StoreTransform = (data: unknown) => unknown;

/** The handlers a `TracingChannel` subscriber may provide. */
export interface TracingChannelSubscribers {
  start?: MessageHandler;
  end?: MessageHandler;
  asyncStart?: MessageHandler;
  asyncEnd?: MessageHandler;
  error?: MessageHandler;
}

/** The sub-channel names a `TracingChannel` owns, in Node's order. */
export const TRACING_EVENTS = ["start", "end", "asyncStart", "asyncEnd", "error"] as const;

export type TracingEvent = (typeof TRACING_EVENTS)[number];
