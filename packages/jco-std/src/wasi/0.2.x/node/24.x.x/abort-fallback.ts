/** Abort primitives for engines without DOM globals. Native constructors are preserved. */
type Listener = EventListenerOrEventListenerObject;
class PortableEventTarget {
  #listeners = new Map<string, Map<Listener, boolean>>();
  addEventListener(
    type: string,
    callback: Listener | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (callback === null) {
      return;
    }
    const listeners = this.#listeners.get(type) ?? new Map();
    if (!listeners.has(callback)) {
      listeners.set(callback, typeof options === "object" && options.once === true);
    }
    this.#listeners.set(type, listeners);
  }
  removeEventListener(type: string, callback: Listener | null): void {
    if (callback) {
      this.#listeners.get(type)?.delete(callback);
    }
  }
  dispatchEvent(event: Event): boolean {
    const listeners = this.#listeners.get(event.type);
    for (const [callback, once] of [...(listeners ?? [])]) {
      if (!listeners?.has(callback)) {
        continue;
      }
      if (once) {
        listeners.delete(callback);
      }
      if (typeof callback === "function") {
        Reflect.apply(callback, this, [event]);
      } else {
        callback.handleEvent(event);
      }
    }
    return !event.defaultPrevented;
  }
}
const Target = globalThis.EventTarget ?? PortableEventTarget;
function reason(name = "AbortError", message = "This operation was aborted"): Error {
  return globalThis.DOMException
    ? new DOMException(message, name)
    : Object.assign(new Error(message), { name });
}
const token = {};
class PortableAbortSignal extends Target {
  #aborted = false;
  #reason: unknown;
  onabort: ((event: Event) => void) | null = null;
  constructor(key?: object) {
    super();
    if (key !== token) {
      throw new TypeError("Illegal constructor");
    }
  }
  get aborted(): boolean {
    return this.#aborted;
  }
  get reason(): unknown {
    return this.#reason;
  }
  throwIfAborted(): void {
    if (this.#aborted) {
      throw this.#reason;
    }
  }
  abort(value: unknown = reason()): void {
    if (this.#aborted) {
      return;
    }
    this.#aborted = true;
    this.#reason = value;
    const event = globalThis.Event
      ? new Event("abort")
      : ({ type: "abort", target: this, defaultPrevented: false } as unknown as Event);
    this.dispatchEvent(event);
    this.onabort?.(event);
  }
  static abort(value?: unknown): PortableAbortSignal {
    const signal = new PortableAbortSignal(token);
    signal.abort(value);
    return signal;
  }
  static timeout(milliseconds: number): PortableAbortSignal {
    const signal = new PortableAbortSignal(token);
    const timer = setTimeout(
      () => signal.abort(reason("TimeoutError", "The operation was aborted due to timeout")),
      milliseconds,
    );
    (timer as unknown as { unref?: () => void }).unref?.();
    return signal;
  }
  static any(signals: AbortSignal[]): PortableAbortSignal {
    const result = new PortableAbortSignal(token);
    const cleanups: (() => void)[] = [];
    for (const signal of signals) {
      if (signal.aborted) {
        result.abort(signal.reason);
        break;
      }
      const abort = () => result.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", abort));
    }
    const cleanup = () => {
      for (const fn of cleanups) {
        fn();
      }
    };
    if (result.aborted) {
      cleanup();
    } else {
      result.addEventListener("abort", cleanup, { once: true });
    }
    return result;
  }
}
class PortableAbortController {
  readonly signal = new PortableAbortSignal(token);
  abort(value?: unknown): void {
    this.signal.abort(value);
  }
}
export const AbortController =
  globalThis.AbortController ??
  (PortableAbortController as unknown as typeof globalThis.AbortController);
export const AbortSignal =
  globalThis.AbortSignal ?? (PortableAbortSignal as unknown as typeof globalThis.AbortSignal);
globalThis.AbortController ??= AbortController;
globalThis.AbortSignal ??= AbortSignal;
