/**
 * Context scopes shared by `AsyncLocalStorage` and `AsyncResource`.
 *
 * Each storage keeps its own stack of active values. Entering pushes, leaving pops, so nesting
 * behaves like Node's for synchronous code. Jco enables continuation snapshots after lowering
 * async functions to Promise continuations; direct imports retain synchronous scopes.
 */

/** A value bound to a storage for the duration of a scope. */
export type Store = unknown;

/** Identifies one storage's stack without exposing the storage object itself. */
export interface ContextKey {
  readonly id: number;
}

const stacks = new Map<number, Store[]>();
let nextId = 1;
let propagation = false;
export function hasAsyncPropagation(): boolean {
  return propagation;
}

/** The bundler lowers await to Promise continuations before enabling this hook. */
export function installAsyncPropagation(): void {
  if (propagation) {
    return;
  }
  propagation = true;
  const then = Promise.prototype.then;
  Promise.prototype.then = function (fulfilled, rejected) {
    const captured = captureAll();
    const bind = (callback: unknown) =>
      typeof callback === "function"
        ? function (this: unknown, ...args: unknown[]) {
            return withCaptured(captured, () => Reflect.apply(callback, this, args));
          }
        : callback;
    return Reflect.apply(then, this, [bind(fulfilled), bind(rejected)]);
  };
  const microtask = globalThis.queueMicrotask;
  if (microtask) {
    globalThis.queueMicrotask = (callback) => {
      const captured = captureAll();
      microtask(() => withCaptured(captured, callback));
    };
  }
}

/** Create a key with its own independent stack. */
export function createKey(): ContextKey {
  const key = { id: nextId++ };
  stacks.set(key.id, []);
  return key;
}

/** The value currently in scope, or `undefined` outside any scope. */
export function current(key: ContextKey): Store {
  const stack = stacks.get(key.id);
  return stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
}

/** Run `fn` with `store` in scope, restoring the previous scope afterwards. */
export function withStore<T>(key: ContextKey, store: Store, fn: () => T): T {
  const stack = stacks.get(key.id);
  if (!stack) {
    throw new Error("async context used after its storage was disabled");
  }
  stack.push(store);
  try {
    return fn();
  } finally {
    stack.pop();
  }
}

/** Replace the value in the innermost scope, as `enterWith` does. */
export function setCurrent(key: ContextKey, store: Store): void {
  const stack = stacks.get(key.id);
  if (!stack) {
    return;
  }
  if (stack.length === 0) {
    stack.push(store);
  } else {
    stack[stack.length - 1] = store;
  }
}

/** Drop every value, as `disable` does. */
export function clear(key: ContextKey): void {
  stacks.set(key.id, []);
}

/** Capture every storage's current value, for `snapshot`. */
export function captureAll(): Map<number, Store> {
  const captured = new Map<number, Store>();
  for (const [id, stack] of stacks) {
    if (stack.length > 0) {
      captured.set(id, stack[stack.length - 1]);
    }
  }
  return captured;
}

/** Run `fn` with a previously captured set of values in scope. */
export function withCaptured<T>(captured: Map<number, Store>, fn: () => T): T {
  const entered: number[] = [];
  for (const [id, stack] of stacks) {
    stack.push(captured.get(id));
    entered.push(id);
  }
  try {
    return fn();
  } finally {
    for (const id of entered) {
      stacks.get(id)?.pop();
    }
  }
}
