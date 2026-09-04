/**
 * `node:timers` for a component, and the `setImmediate` global that comes with it.
 *
 * The engine already supplies the web timer functions -- `setTimeout`, `setInterval` and
 * their cancels -- backed by `wasi:clocks`. What it does not supply is `setImmediate`, which
 * is Node's and not the web's, and which Node-shaped HTTP code calls unconditionally:
 * Express's router uses it to break deep synchronous middleware recursion, and
 * `finalhandler` uses it to report an error after the response is on its way.
 *
 * `setImmediate` is defined here as a zero-delay timeout. That is the ordinary portable
 * stand-in: it preserves the property callers depend on -- the callback runs on a later turn
 * of the event loop, after the current stack unwinds -- without Node's check-phase ordering
 * relative to I/O, which a component does not have a counterpart for anyway.
 */

/** The handle `setImmediate()` returns, matching what Node's `Immediate` exposes. */
export class Immediate {
  /** The underlying timer, so `clearImmediate()` can cancel it. */
  readonly #timer: ReturnType<typeof setTimeout>;

  /** Whether this handle keeps the event loop alive. Always `true`; nothing here can unref. */
  #referenced = true;

  constructor(timer: ReturnType<typeof setTimeout>) {
    this.#timer = timer;
  }

  /** The timer to cancel. */
  get timer(): ReturnType<typeof setTimeout> {
    return this.#timer;
  }

  /** Node's `immediate.hasRef()`. */
  hasRef(): boolean {
    return this.#referenced;
  }

  /** Node's `immediate.ref()`. The host owns the event loop, so this only records intent. */
  ref(): this {
    this.#referenced = true;
    return this;
  }

  /** Node's `immediate.unref()`. The host owns the event loop, so this only records intent. */
  unref(): this {
    this.#referenced = false;
    return this;
  }
}

/**
 * Run a callback on a later turn of the event loop, as Node's `setImmediate()` does.
 *
 * @param callback - the function to run
 * @param args - arguments passed through to the callback
 * @returns a handle that `clearImmediate()` accepts
 */
export function setImmediate<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  ...args: TArgs
): Immediate {
  if (typeof callback !== "function") {
    const error = new TypeError(
      `The "callback" argument must be of type function. Received ${typeof callback}`,
    ) as TypeError & { code: string };
    error.code = "ERR_INVALID_ARG_TYPE";
    throw error;
  }
  return new Immediate(setTimeout(callback as (...rest: unknown[]) => void, 0, ...args));
}

/**
 * Cancel a pending {@link setImmediate}.
 *
 * @param immediate - the handle to cancel
 */
export function clearImmediate(immediate: Immediate | undefined): void {
  if (immediate) {
    clearTimeout(immediate.timer);
  }
}

/** The engine's `setTimeout`, which `node:timers` also exports. */
const nodeSetTimeout = globalThis.setTimeout;

/** The engine's `clearTimeout`, which `node:timers` also exports. */
const nodeClearTimeout = globalThis.clearTimeout;

/** The engine's `setInterval`, which `node:timers` also exports. */
const nodeSetInterval = globalThis.setInterval;

/** The engine's `clearInterval`, which `node:timers` also exports. */
const nodeClearInterval = globalThis.clearInterval;

export {
  nodeSetTimeout as setTimeout,
  nodeClearTimeout as clearTimeout,
  nodeSetInterval as setInterval,
  nodeClearInterval as clearInterval,
};

export default {
  Immediate,
  clearImmediate,
  clearInterval: nodeClearInterval,
  clearTimeout: nodeClearTimeout,
  setImmediate,
  setInterval: nodeSetInterval,
  setTimeout: nodeSetTimeout,
};
