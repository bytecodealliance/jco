/**
 * Node's `TracingChannel`: a group of channels describing one traced operation.
 *
 * Adapted from nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/diagnostics_channel.js (MIT
 * license). `traceSync`, `tracePromise`, and `traceCallback` keep the upstream
 * publish order and context mutation; primordials, the native channel binding,
 * and the subscriber fast path are dropped, and the surface is typed.
 */

import { channel, type Channel } from "./channel.js";
import { TRACING_EVENTS, type TracingChannelSubscribers, type TracingEvent } from "./types.js";

/** Node names a tracing channel's sub-channels `tracing:<name>:<event>`. */
function subChannelName(name: string, event: TracingEvent): string {
  return `tracing:${name}:${event}`;
}

/**
 * Node's `TracingChannel`: a group of channels describing one traced operation.
 *
 * `start`/`end` bracket the call, `error` reports a throw, and `asyncStart`/`asyncEnd` bracket the
 * asynchronous portion of `tracePromise` and `traceCallback`.
 */
export class TracingChannel {
  readonly start: Channel;
  readonly end: Channel;
  readonly asyncStart: Channel;
  readonly asyncEnd: Channel;
  readonly error: Channel;

  constructor(name: string) {
    this.start = channel(subChannelName(name, "start"));
    this.end = channel(subChannelName(name, "end"));
    this.asyncStart = channel(subChannelName(name, "asyncStart"));
    this.asyncEnd = channel(subChannelName(name, "asyncEnd"));
    this.error = channel(subChannelName(name, "error"));
  }

  /** Whether any of the sub-channels has a subscriber. A getter, as Node has it. */
  get hasSubscribers(): boolean {
    return TRACING_EVENTS.some((event) => this[event].hasSubscribers);
  }

  subscribe(subscribers: TracingChannelSubscribers): void {
    for (const event of TRACING_EVENTS) {
      const handler = subscribers[event];
      if (handler) {
        this[event].subscribe(handler);
      }
    }
  }

  unsubscribe(subscribers: TracingChannelSubscribers): boolean {
    let removedAny = false;
    for (const event of TRACING_EVENTS) {
      const handler = subscribers[event];
      if (handler && this[event].unsubscribe(handler)) {
        removedAny = true;
      }
    }
    return removedAny;
  }

  /**
   * Trace a synchronous call.
   *
   * Publishes `start`, then `end` once the call returns -- and `error` before `end` if it throws,
   * matching the order Node emits.
   */
  traceSync<R>(
    fn: (...args: never[]) => R,
    context: Record<string, unknown> = {},
    thisArg?: unknown,
    ...args: never[]
  ): R {
    return this.start.runStores(context, () => {
      try {
        const result = Reflect.apply(fn, thisArg, args) as R;
        context.result = result;
        return result;
      } catch (error) {
        context.error = error;
        this.error.publish(context);
        throw error;
      } finally {
        this.end.publish(context);
      }
    });
  }

  /** Trace a promise-returning call, bracketing its asynchronous portion. */
  tracePromise<R>(
    fn: (...args: never[]) => PromiseLike<R>,
    context: Record<string, unknown> = {},
    thisArg?: unknown,
    ...args: never[]
  ): PromiseLike<R> {
    return this.start.runStores(context, () => {
      let promise: PromiseLike<R>;
      try {
        promise = Reflect.apply(fn, thisArg, args) as PromiseLike<R>;
      } catch (error) {
        context.error = error;
        this.error.publish(context);
        throw error;
      } finally {
        // `end` closes the synchronous call, before the promise settles.
        this.end.publish(context);
      }

      return promise.then(
        (result) => {
          context.result = result;
          this.asyncStart.publish(context);
          this.asyncEnd.publish(context);
          return result;
        },
        (error: unknown) => {
          // Node reports the error before opening the asynchronous bracket.
          context.error = error;
          this.error.publish(context);
          this.asyncStart.publish(context);
          this.asyncEnd.publish(context);
          throw error;
        },
      );
    });
  }

  /**
   * Trace a callback-taking call.
   *
   * The callback is wrapped in place at `position`, so the traced function still receives the
   * arguments it expects.
   */
  traceCallback<R>(
    fn: (...args: never[]) => R,
    position = -1,
    context: Record<string, unknown> = {},
    thisArg?: unknown,
    ...args: never[]
  ): R {
    const callbackIndex = position >= 0 ? position : args.length - 1;
    const original = args[callbackIndex] as unknown;
    if (typeof original === "function") {
      const wrapped = (...callbackArgs: unknown[]) => {
        const [error] = callbackArgs;
        this.asyncStart.publish(context);
        if (error) {
          context.error = error;
          this.error.publish(context);
        }
        try {
          return Reflect.apply(original as (...a: unknown[]) => unknown, thisArg, callbackArgs);
        } finally {
          this.asyncEnd.publish(context);
        }
      };
      args[callbackIndex] = wrapped as never;
    }

    return this.start.runStores(context, () => {
      try {
        return Reflect.apply(fn, thisArg, args) as R;
      } catch (error) {
        context.error = error;
        this.error.publish(context);
        throw error;
      } finally {
        this.end.publish(context);
      }
    });
  }
}

export function tracingChannel(name: string): TracingChannel {
  return new TracingChannel(name);
}
