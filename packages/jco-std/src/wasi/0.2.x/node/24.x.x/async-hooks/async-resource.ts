import { AsyncLocalStorage } from "./async-local-storage.js";
import { unsupported } from "./errors.js";

let nextAsyncId = 1;

/**
 * Node's `AsyncResource`, limited to synchronous scopes.
 *
 * Node ties a resource into the async id graph so hooks can observe its lifetime. There is no such
 * graph here, so the ids are locally unique and stable but describe nothing the runtime tracks.
 */
export class AsyncResource {
  readonly #type: string;
  readonly #asyncId: number;
  readonly #triggerAsyncId: number;
  /**
   * Stores active when the resource was constructed.
   *
   * Node binds a resource to the context it was created in, not the one it is later called from,
   * so this is captured here rather than in `runInAsyncScope`.
   */
  readonly #scope: ReturnType<typeof AsyncLocalStorage.snapshot>;

  constructor(type: string, options?: { triggerAsyncId?: number }) {
    if (typeof type !== "string") {
      const error = new TypeError(
        `The "type" argument must be of type string. Received ${typeof type}`,
      ) as TypeError & {
        code: string;
      };
      error.code = "ERR_INVALID_ARG_TYPE";
      throw error;
    }
    this.#type = type;
    this.#asyncId = nextAsyncId++;
    this.#triggerAsyncId = options?.triggerAsyncId ?? 0;
    this.#scope = AsyncLocalStorage.snapshot();
  }

  /** The resource type given to the constructor. */
  get type(): string {
    return this.#type;
  }

  /** Locally unique id. Stable, but not part of any runtime-tracked graph. */
  asyncId(): number {
    return this.#asyncId;
  }

  /** The id this resource was created under, or `0` when none was supplied. */
  triggerAsyncId(): number {
    return this.#triggerAsyncId;
  }

  /** Call `fn` with the stores that were active when this resource was constructed. */
  runInAsyncScope<R>(fn: (...args: never[]) => R, thisArg?: unknown, ...args: never[]): R {
    return this.#scope(() => Reflect.apply(fn, thisArg, args) as R);
  }

  /** Bind `fn` so a later synchronous call runs in this resource's scope. */
  bind<F extends (...args: never[]) => unknown>(fn: F): F {
    // Capture the scope rather than the resource, so `this` inside `bound` stays the caller's.
    const scope = this.#scope;
    return function bound(this: unknown, ...args: never[]) {
      return scope(() => Reflect.apply(fn, this, args) as never);
    } as unknown as F;
  }

  /** Bind `fn` to the stores active now. */
  static bind<F extends (...args: never[]) => unknown>(fn: F, type = "bound-anonymous-fn"): F {
    return new AsyncResource(type).bind(fn);
  }

  /**
   * Node emits a `destroy` hook here.
   *
   * There are no hooks to notify, so this would be a silent no-op; it throws instead, because a
   * caller emitting destroy is expecting an observer that does not exist.
   */
  emitDestroy(): never {
    throw unsupported(
      "asyncResource.emitDestroy()",
      "it notifies async hooks, and createHook is not supported in a component",
    );
  }
}
