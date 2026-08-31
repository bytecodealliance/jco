/**
 * Synchronous context stack shared by `AsyncLocalStorage` and `AsyncResource`.
 *
 * Each storage keeps its own stack of active values. Entering pushes, leaving pops, so nesting
 * behaves like Node's for synchronous code. There is deliberately no asynchronous propagation --
 * see `errors.ts` and the module docs for why it cannot be done here.
 */

/** A value bound to a storage for the duration of a scope. */
export type Store = unknown;

/** Identifies one storage's stack without exposing the storage object itself. */
export interface ContextKey {
  readonly id: number;
}

const stacks = new Map<number, Store[]>();
let nextId = 1;

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
