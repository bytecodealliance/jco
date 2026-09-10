/**
 * Adapted from nodejs/node lib/internal/test_runner/mock/mock.js,
 * v24.20.0, commit 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT (see LICENSE).
 * Local changes: explicit TypeScript types, standard intrinsics and shared error
 * helpers replace primordials/internal validators. Loader and native timer mocks
 * fail immediately. Symbol methods restore like string methods (upstream fix).
 * Types adapted from DefinitelyTyped @types/node 24.13.3 test.d.ts (MIT).
 */
import {
  boolean,
  integer,
  invalidArgType,
  invalidArgValue,
  unsupported,
  validateFunction,
  validateObject,
  deprecatedNodeApi,
} from "./errors.js";

// `never[]` accepts arbitrary call signatures without erasing their inferred types.
type Callable = (...args: never[]) => unknown;
export type MockableFunction = Callable | (new (...args: never[]) => object);
export type MockArguments<F extends MockableFunction> = F extends (...args: infer A) => unknown
  ? A
  : F extends new (...args: infer A) => object
    ? A
    : never;
export type MockResult<F extends MockableFunction> = F extends (...args: never[]) => infer R
  ? R
  : F extends new (...args: never[]) => infer R
    ? R
    : never;
export interface MockOptions {
  times?: number;
}
export interface MockMethodOptions extends MockOptions {
  getter?: boolean;
  setter?: boolean;
}
export interface MockFunctionCall<F extends MockableFunction> {
  arguments: MockArguments<F>;
  error: unknown;
  result: MockResult<F> | undefined;
  stack: Error;
  target: F | undefined;
  this: unknown;
}
export type Mock<F extends MockableFunction> = F & { mock: MockFunctionContext<F> };
interface Restore {
  original: MockableFunction;
  object?: object;
  methodName?: string | symbol;
  descriptor?: PropertyDescriptor;
}
interface FunctionState<F extends MockableFunction> {
  calls: MockFunctionCall<F>[];
  mocks: Map<number, F>;
  implementation: F;
  restore: Restore;
  times: number;
}
const states = new WeakMap<object, FunctionState<MockableFunction>>();

export class MockFunctionContext<F extends MockableFunction = MockableFunction> {
  readonly #state: FunctionState<F>;
  constructor(implementation: F, restore: Restore, times: number) {
    this.#state = { calls: [], mocks: new Map(), implementation, restore, times };
    // State is only used by the type-preserving Proxy; its arguments/results come from F.
    states.set(this, this.#state);
  }
  get calls(): MockFunctionCall<F>[] {
    return this.#state.calls.slice();
  }
  callCount(): number {
    return this.#state.calls.length;
  }
  mockImplementation(implementation: F): void {
    validateFunction(implementation, "implementation");
    this.#state.implementation = implementation;
  }
  mockImplementationOnce(implementation: F, onCall?: number): void {
    validateFunction(implementation, "implementation");
    const call = onCall ?? this.callCount();
    integer(call, "onCall", this.callCount());
    this.#state.mocks.set(call, implementation);
  }
  restore(): void {
    const { object, methodName, descriptor, original } = this.#state.restore;
    if (methodName !== undefined && object && descriptor) {
      Object.defineProperty(object, methodName, { ...descriptor });
    } else {
      this.#state.implementation = original as F;
    }
  }
  resetCalls(): void {
    this.#state.calls = [];
  }
}

export interface MockPropertyAccess<T> {
  type: "get" | "set";
  value: T;
  stack: Error;
}
export type MockProperty<T extends object, K extends keyof T> = T & {
  mock: MockPropertyContext<T[K]>;
};
export class MockPropertyContext<T = unknown> {
  readonly #object: object;
  readonly #propertyName: string | symbol;
  readonly #originalValue: T;
  readonly #descriptor: PropertyDescriptor;
  #value: T;
  #accesses: MockPropertyAccess<T>[] = [];
  readonly #onceValues = new Map<number, T>();
  constructor(object: object, propertyName: string | symbol, ...values: [] | [T]) {
    this.#object = object;
    this.#propertyName = propertyName;
    this.#originalValue = Reflect.get(object, propertyName) as T;
    this.#value = values.length ? values[0] : this.#originalValue;
    const descriptor = Object.getOwnPropertyDescriptor(object, propertyName);
    if (!descriptor) {
      throw invalidArgValue("propertyName", propertyName, "is not a property of the object");
    }
    this.#descriptor = descriptor;
    Object.defineProperty(object, propertyName, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: (): T => {
        const value = this.#getAccessValue(this.#value);
        this.#accesses.push({ type: "get", value, stack: new Error() });
        return value;
      },
      set: this.mockImplementation.bind(this),
    });
  }
  get accesses(): MockPropertyAccess<T>[] {
    return this.#accesses.slice();
  }
  accessCount(): number {
    return this.#accesses.length;
  }
  mockImplementation(value: T): void {
    if (!this.#descriptor.writable) {
      throw invalidArgValue("propertyName", this.#propertyName, "cannot be set");
    }
    const next = this.#getAccessValue(value);
    this.#accesses.push({ type: "set", value: next, stack: new Error() });
    this.#value = next;
  }
  #getAccessValue(value: T): T {
    const index = this.#accesses.length;
    if (!this.#onceValues.has(index)) {
      return value;
    }
    const next = this.#onceValues.get(index)!;
    this.#onceValues.delete(index);
    return next;
  }
  mockImplementationOnce(value: T, onAccess?: number): void {
    const index = onAccess ?? this.accessCount();
    integer(index, "onAccess", this.accessCount());
    this.#onceValues.set(index, value);
  }
  resetAccesses(): void {
    this.#accesses = [];
  }
  restore(): void {
    Object.defineProperty(this.#object, this.#propertyName, {
      ...this.#descriptor,
      value: this.#originalValue,
    });
  }
}

export interface MockTimersOptions {
  apis?: readonly ("setTimeout" | "setInterval" | "setImmediate" | "Date")[];
  now?: number | Date;
}
export class MockTimers {
  enable(options?: MockTimersOptions): void {
    if (Array.isArray(options)) {
      throw deprecatedNodeApi("mock.timers.enable(timers)", "mock.timers.enable({ apis })");
    }
    unsupported("mock.timers.enable()", "shared Node timer internals are unavailable");
  }
  tick(_milliseconds?: number): void {
    unsupported("mock.timers.tick()", "shared Node timer internals are unavailable");
  }
  runAll(): void {
    unsupported("mock.timers.runAll()", "shared Node timer internals are unavailable");
  }
  setTime(_milliseconds: number): void {
    unsupported("mock.timers.setTime()", "shared Node timer internals are unavailable");
  }
  // No timer state can have been installed by this tracker.
  reset(): void {}
  [Symbol.dispose](): void {
    this.reset();
  }
}
export interface MockModuleOptions {
  cache?: boolean;
  exports?: object;
  /** @deprecated Use exports.default. */ defaultExport?: unknown;
  /** @deprecated Use exports. */ namedExports?: object;
}
export interface MockModuleContext {
  restore(): void;
}
const defaultFunction = function (): void {};
function validateTimes(times: unknown): asserts times is number {
  if (times !== Infinity) {
    integer(times, "options.times", 1);
  }
}
function key(value: unknown, name: string): asserts value is string | symbol {
  if (typeof value !== "string" && typeof value !== "symbol") {
    throw invalidArgType(name, ["string", "symbol"], value);
  }
}
function descriptorInChain(object: object, name: PropertyKey): PropertyDescriptor | undefined {
  for (let host: object | null = object; host !== null; host = Object.getPrototypeOf(host)) {
    const descriptor = Object.getOwnPropertyDescriptor(host, name);
    if (descriptor) {
      return descriptor;
    }
  }
  return undefined;
}

export class MockTracker {
  #mocks: { restore(): void }[] = [];
  #timers?: MockTimers;
  get timers(): MockTimers {
    return (this.#timers ??= new MockTimers());
  }
  fn<F extends MockableFunction = () => void>(
    original?: F,
    implementation?: F,
    options?: MockOptions,
  ): Mock<F>;
  fn<F extends MockableFunction>(original: F, options: MockOptions): Mock<F>;
  fn(options?: MockOptions): Mock<() => void>;
  fn(
    original: MockableFunction | MockOptions = function (): void {},
    implementation: MockableFunction | MockOptions = original,
    options: MockOptions = {},
  ): Mock<MockableFunction> {
    if (original !== null && typeof original === "object") {
      options = original;
      original = function (): void {};
      implementation = original;
    } else if (implementation !== null && typeof implementation === "object") {
      options = implementation;
      implementation = original;
    }
    validateFunction(original, "original");
    validateFunction(implementation, "implementation");
    validateObject(options, "options");
    const { times = Infinity } = options;
    validateTimes(times);
    return this.#setupMock(new MockFunctionContext(implementation, { original }, times), original);
  }
  method<T extends object, K extends keyof T>(
    object: T,
    methodName: K,
    options?: MockMethodOptions,
  ): Mock<Extract<T[K], MockableFunction>>;
  method<T extends object, K extends keyof T, F extends MockableFunction>(
    object: T,
    methodName: K,
    implementation: F,
    options?: MockMethodOptions,
  ): Mock<F>;
  method(
    object: object,
    methodName: PropertyKey,
    implementation: MockableFunction | MockMethodOptions = defaultFunction,
    options: MockMethodOptions = {},
  ): Mock<MockableFunction> {
    key(methodName, "methodName");
    if (typeof object !== "function") {
      validateObject(object, "object");
    }
    if (implementation !== null && typeof implementation === "object") {
      options = implementation;
      implementation = defaultFunction;
    }
    validateFunction(implementation, "implementation");
    validateObject(options, "options");
    const { getter = false, setter = false, times = Infinity } = options;
    boolean(getter, "options.getter");
    boolean(setter, "options.setter");
    validateTimes(times);
    if (getter && setter) {
      throw invalidArgValue("options.setter", setter, "cannot be used with 'options.getter'");
    }
    const descriptor = descriptorInChain(object, methodName);
    const original: unknown = getter
      ? descriptor?.get
      : setter
        ? descriptor?.set
        : descriptor?.value;
    if (typeof original !== "function") {
      throw invalidArgValue("methodName", original, "must be a method");
    }
    // Runtime validation above establishes a callable function.
    const fn = original as MockableFunction;
    const context = new MockFunctionContext(
      implementation === defaultFunction ? fn : implementation,
      { original: fn, object, methodName, descriptor },
      times,
    );
    const mock = this.#setupMock(context, fn);
    const mockDescriptor: PropertyDescriptor = {
      configurable: descriptor!.configurable,
      enumerable: descriptor!.enumerable,
    };
    if (getter) {
      mockDescriptor.get = mock as Mock<Callable>;
      mockDescriptor.set = descriptor!.set;
    } else if (setter) {
      mockDescriptor.get = descriptor!.get;
      mockDescriptor.set = mock as Mock<Callable>;
    } else {
      mockDescriptor.writable = descriptor!.writable;
      mockDescriptor.value = mock;
    }
    Object.defineProperty(object, methodName, mockDescriptor);
    return mock;
  }
  getter<T extends object, K extends keyof T>(
    object: T,
    methodName: K,
    implementation?: (() => T[K]) | MockMethodOptions,
    options?: MockMethodOptions,
  ): Mock<() => T[K]> {
    if (implementation !== null && typeof implementation === "object") {
      options = implementation;
      implementation = undefined;
    }
    options ??= {};
    validateObject(options, "options");
    const { getter = true } = options;
    boolean(getter, "options.getter");
    if (getter === false) {
      throw invalidArgValue("options.getter", getter, "cannot be false");
    }
    // The accessor descriptor validated by method has this getter signature.
    return this.method(object, methodName, implementation ?? defaultFunction, {
      ...options,
      getter,
    }) as Mock<() => T[K]>;
  }
  setter<T extends object, K extends keyof T>(
    object: T,
    methodName: K,
    implementation?: ((value: T[K]) => void) | MockMethodOptions,
    options?: MockMethodOptions,
  ): Mock<(value: T[K]) => void> {
    if (implementation !== null && typeof implementation === "object") {
      options = implementation;
      implementation = undefined;
    }
    options ??= {};
    validateObject(options, "options");
    const { setter = true } = options;
    boolean(setter, "options.setter");
    if (setter === false) {
      throw invalidArgValue("options.setter", setter, "cannot be false");
    }
    return this.method(object, methodName, implementation ?? defaultFunction, {
      ...options,
      setter,
    });
  }
  property<T extends object, K extends keyof T>(
    object: T,
    propertyName: K,
    ...values: [] | [T[K]]
  ): MockProperty<T, K> {
    validateObject(object, "object");
    key(propertyName, "propertyName");
    const context = new MockPropertyContext<T[K]>(object, propertyName, ...values);
    this.#mocks.push(context);
    // Proxy adds only the mock context; all other properties retain T's contract.
    return new Proxy(object, {
      get(target: T, property: PropertyKey, receiver: unknown): unknown {
        return property === "mock" ? context : Reflect.get(target, property, receiver);
      },
    }) as MockProperty<T, K>;
  }
  module(_specifier: string | URL, _options?: MockModuleOptions): MockModuleContext {
    return unsupported(
      "mock.module()",
      "component modules are linked before execution; runtime loader hooks are unavailable",
    );
  }
  reset(): void {
    this.restoreAll();
    this.#timers?.reset();
    this.#mocks = [];
  }
  restoreAll(): void {
    for (const mock of this.#mocks) {
      mock.restore();
    }
  }
  #setupMock<F extends MockableFunction>(context: MockFunctionContext<F>, original: F): Mock<F> {
    const state = states.get(context)!;
    const next = (): MockableFunction => {
      const index = state.calls.length;
      const implementation = state.mocks.get(index) ?? state.implementation;
      if (index + 1 === state.times) {
        context.restore();
      }
      state.mocks.delete(index);
      return implementation;
    };
    const proxy = new Proxy(original, {
      apply(_target: F, thisArg: unknown, argumentsList: unknown[]): unknown {
        const implementation = next();
        let result: unknown;
        let error: unknown;
        try {
          result = Reflect.apply(implementation, thisArg, argumentsList);
        } catch (caught) {
          error = caught;
          throw caught;
        } finally {
          state.calls.push({
            arguments: argumentsList as never[],
            error,
            result,
            stack: new Error(),
            target: undefined,
            this: thisArg,
          });
        }
        return result;
      },
      construct(
        target: F,
        argumentsList: unknown[],
        newTarget: new (...args: never[]) => object,
      ): object {
        const implementation = next();
        let result: object | undefined;
        let error: unknown;
        try {
          result = Reflect.construct(implementation, argumentsList, newTarget);
        } catch (caught) {
          error = caught;
          throw caught;
        } finally {
          state.calls.push({
            arguments: argumentsList as never[],
            error,
            result,
            stack: new Error(),
            target,
            this: result,
          });
        }
        return result!;
      },
      get(target: F, property: PropertyKey, receiver: unknown): unknown {
        return property === "mock" ? context : Reflect.get(target, property, receiver);
      },
    });
    this.#mocks.push(context);
    return proxy as Mock<F>;
  }
}
