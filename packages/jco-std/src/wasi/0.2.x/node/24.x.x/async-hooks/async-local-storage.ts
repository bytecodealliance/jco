import { ASYNC_REASON, unsupported } from "./errors.js";
import {
  captureAll,
  clear,
  createKey,
  current,
  setCurrent,
  withCaptured,
  withStore,
  type ContextKey,
  type Store,
} from "./context.js";

/** Anything with a `then` is a continuation this module cannot follow. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" &&
      value !== null &&
      typeof (value as { then?: unknown }).then === "function") ||
    (typeof value === "function" && typeof (value as { then?: unknown }).then === "function")
  );
}

/**
 * Refuse work that would outlive the synchronous scope.
 *
 * Returning a thenable is the exact moment the store stops being reliable: the continuation runs
 * after this scope has exited. Failing here points at the call site instead of surfacing later as
 * an empty store somewhere unrelated.
 */
function rejectAsync(api: string, result: unknown): void {
  if (isThenable(result)) {
    throw unsupported(api, ASYNC_REASON);
  }
}

/**
 * Node's `AsyncLocalStorage`, limited to synchronous scopes.
 *
 * Node propagates the store across asynchronous continuations. This engine cannot (see
 * `ASYNC_REASON`), so rather than silently yielding an empty store after an `await`, any callback
 * that returns a thenable is rejected outright.
 */
export class AsyncLocalStorage<T = unknown> {
  readonly #key: ContextKey = createKey();
  #disabled = false;

  /** Optional label, matching Node's `name` accessor. */
  get name(): string {
    return "AsyncLocalStorage";
  }

  /** The store for the current synchronous scope, or `undefined` outside one. */
  getStore(): T | undefined {
    if (this.#disabled) {
      return undefined;
    }
    return current(this.#key) as T | undefined;
  }

  /**
   * Run `callback` with `store` in scope.
   *
   * @throws when `callback` returns a thenable, which this engine cannot follow
   */
  run<R>(store: T, callback: (...args: never[]) => R, ...args: never[]): R {
    if (this.#disabled) {
      return callback(...args);
    }
    const result = withStore(this.#key, store as Store, () => callback(...args));
    rejectAsync("AsyncLocalStorage.run(store, callback)", result);
    return result;
  }

  /** Run `callback` with no store in scope. */
  exit<R>(callback: (...args: never[]) => R, ...args: never[]): R {
    const result = withStore(this.#key, undefined, () => callback(...args));
    rejectAsync("AsyncLocalStorage.exit(callback)", result);
    return result;
  }

  /**
   * Set the store for the remainder of the current synchronous scope.
   *
   * In Node this also reaches asynchronous continuations of the current context; here it does not,
   * and unlike `run` there is no return value to inspect, so the difference cannot be detected.
   */
  enterWith(store: T): void {
    if (this.#disabled) {
      return;
    }
    setCurrent(this.#key, store as Store);
  }

  /** Run `callback` with `store` in scope, matching Node's `withScope`. */
  withScope<R>(callback: (...args: never[]) => R, ...args: never[]): R {
    const result = withStore(this.#key, current(this.#key), () => callback(...args));
    rejectAsync("AsyncLocalStorage.withScope(callback)", result);
    return result;
  }

  /** Discard every store and make `getStore` return `undefined`. */
  disable(): void {
    this.#disabled = true;
    clear(this.#key);
  }

  /**
   * Capture the active stores so they can be restored inside another scope.
   *
   * Useful synchronously; it cannot restore context into an asynchronous continuation.
   */
  static snapshot(): <R>(callback: (...args: never[]) => R, ...args: never[]) => R {
    const captured = captureAll();
    return function runInSnapshot(callback, ...args) {
      const result = withCaptured(captured, () => callback(...args));
      rejectAsync("the callback given to AsyncLocalStorage.snapshot()", result);
      return result;
    };
  }

  /** Bind `fn` to the stores active now, so a later synchronous call sees them. */
  static bind<F extends (...args: never[]) => unknown>(fn: F): F {
    const runInSnapshot = AsyncLocalStorage.snapshot();
    return function bound(this: unknown, ...args: never[]) {
      return runInSnapshot(() => Reflect.apply(fn, this, args) as never);
    } as unknown as F;
  }
}
