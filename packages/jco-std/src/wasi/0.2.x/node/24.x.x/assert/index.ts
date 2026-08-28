// Adapted from Node.js lib/assert.js at v24.19.0, commit
// cdc1b38d40cb567b7ad0b39c86addf830a0af0ae:
// https://github.com/nodejs/node/blob/cdc1b38d40cb567b7ad0b39c86addf830a0af0ae/lib/assert.js
// Node.js is MIT licensed (https://github.com/nodejs/node/blob/v24.19.0/LICENSE).
// Node internals are replaced by component-portable helpers; deprecated entry
// points fail immediately, and the public surface is converted to TypeScript.
// Public signatures are adapted from the MIT-licensed @types/node 24.13.3
// assert.d.ts (https://unpkg.com/@types/node@24.13.3/assert.d.ts).

import { AssertionError, type AssertionErrorOptions } from "./assertion-error.js";
import { CallTracker } from "./call-tracker.js";
import { isDeepEqual, isDeepStrictEqual, isPartialStrictEqual } from "./comparisons.js";
import {
  ambiguousArgument,
  constructCallRequired,
  deprecatedNodeApi,
  invalidArgType,
  invalidArgValue,
  invalidReturnValue,
  missingArgs,
  validateFunction,
  validateOneOf,
} from "./errors.js";
import { inspect } from "./inspect.js";

export type AssertionMessage = string | Error | undefined;
export type AssertPredicate =
  | RegExp
  | (new (...args: never[]) => object)
  | ((thrown: unknown) => boolean)
  | object
  | Error;

type UnknownFunction = (...args: never[]) => unknown;

export interface AssertOptions {
  diff?: "simple" | "full";
  strict?: boolean;
  skipPrototype?: boolean;
}

interface ResolvedAssertOptions {
  diff?: "simple" | "full";
  strict: boolean;
  skipPrototype: boolean;
}

const optionsByInstance = new WeakMap<object, ResolvedAssertOptions>();
const noException = Symbol("no exception");

function optionsOf(value: unknown): ResolvedAssertOptions | undefined {
  return value !== null && (typeof value === "object" || typeof value === "function")
    ? optionsByInstance.get(value as object)
    : undefined;
}

function failWith(options: AssertionErrorOptions): never {
  throw new AssertionError(options);
}

function failure(
  options: Omit<AssertionErrorOptions, "message"> & { message?: AssertionMessage },
): never {
  if (options.message instanceof Error) {
    throw options.message;
  }
  failWith({ ...options, message: options.message });
}

function looseEqual(left: unknown, right: unknown): boolean {
  type Primitive = null | undefined | string | number | bigint | boolean | symbol;
  // Node's legacy assertion mode deliberately follows JavaScript coercive equality.
  // eslint-disable-next-line eqeqeq
  return (left as Primitive) == (right as Primitive);
}

function property(value: object, key: PropertyKey): unknown {
  return Reflect.get(value, key);
}

function messageOf(value: unknown): unknown {
  return value !== null && (typeof value === "object" || typeof value === "function")
    ? property(value, "message")
    : undefined;
}

function innerOk(
  value: unknown,
  message: AssertionMessage,
  argumentCount: number,
  stackStartFn: UnknownFunction,
): asserts value {
  if (value) {
    return;
  }
  if (message instanceof Error) {
    throw message;
  }
  const generated = argumentCount === 0 || message == null;
  const text =
    argumentCount === 0
      ? "No value argument passed to `assert.ok()`"
      : message == null
        ? "The expression evaluated to a falsy value"
        : message;
  const error = new AssertionError({
    actual: value,
    expected: true,
    message: text,
    operator: "==",
    stackStartFn,
  });
  error.generatedMessage = generated;
  throw error;
}

class AssertImplementation {
  AssertionError = AssertionError;

  constructor(options: AssertOptions = {}) {
    const resolved: ResolvedAssertOptions = { strict: true, skipPrototype: false, ...options };
    if (resolved.diff !== undefined) {
      validateOneOf(resolved.diff, "options.diff", ["simple", "full"]);
    }
    optionsByInstance.set(this, resolved);
    if (resolved.strict) {
      this.equal = this.strictEqual;
      this.deepEqual = this.deepStrictEqual;
      this.notEqual = this.notStrictEqual;
      this.notDeepEqual = this.notDeepStrictEqual;
    }
  }

  fail(message?: string | Error): never;
  /** @deprecated DEP0094: use fail([message]) or another assertion method. */
  fail(
    actual: unknown,
    expected: unknown,
    message?: string | Error,
    operator?: string,
    stackStartFn?: (...args: never[]) => unknown,
  ): never;
  fail(actual?: unknown, ...deprecatedArguments: unknown[]): never {
    if (deprecatedArguments.length > 0) {
      throw deprecatedNodeApi(
        "assert.fail(actual, expected, ...rest) (DEP0094)",
        "assert.strictEqual()",
      );
    }
    const message = arguments.length === 0 || actual == null ? "Failed" : actual;
    if (message instanceof Error) {
      throw message;
    }
    const error = new AssertionError({
      actual: undefined,
      expected: undefined,
      operator: "fail",
      message: String(message),
      stackStartFn: AssertImplementation.prototype.fail,
      diff: optionsOf(this)?.diff,
    });
    if (arguments.length === 0 || actual == null) {
      error.generatedMessage = true;
    }
    throw error;
  }

  ok(value: unknown, message?: AssertionMessage): asserts value {
    innerOk(value, message, arguments.length, AssertImplementation.prototype.ok);
  }

  equal(actual: unknown, expected: unknown, message?: AssertionMessage): void {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    // Node's legacy equality deliberately uses coercive equality.
    // eslint-disable-next-line eqeqeq
    if (!looseEqual(actual, expected) && (!Number.isNaN(actual) || !Number.isNaN(expected))) {
      failure({
        actual,
        expected,
        message,
        operator: "==",
        stackStartFn: AssertImplementation.prototype.equal,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  notEqual(actual: unknown, expected: unknown, message?: AssertionMessage): void {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    // eslint-disable-next-line eqeqeq
    if (looseEqual(actual, expected) || (Number.isNaN(actual) && Number.isNaN(expected))) {
      failure({
        actual,
        expected,
        message,
        operator: "!=",
        stackStartFn: AssertImplementation.prototype.notEqual,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  deepEqual(actual: unknown, expected: unknown, message?: AssertionMessage): void {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    if (!isDeepEqual(actual, expected)) {
      failure({
        actual,
        expected,
        message,
        operator: "deepEqual",
        stackStartFn: AssertImplementation.prototype.deepEqual,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  notDeepEqual(actual: unknown, expected: unknown, message?: AssertionMessage): void {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    if (isDeepEqual(actual, expected)) {
      failure({
        actual,
        expected,
        message,
        operator: "notDeepEqual",
        stackStartFn: AssertImplementation.prototype.notDeepEqual,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  deepStrictEqual<T>(
    actual: unknown,
    expected: T,
    message?: AssertionMessage,
  ): asserts actual is T {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    if (!isDeepStrictEqual(actual, expected, optionsOf(this)?.skipPrototype)) {
      failure({
        actual,
        expected,
        message,
        operator: "deepStrictEqual",
        stackStartFn: AssertImplementation.prototype.deepStrictEqual,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  notDeepStrictEqual(actual: unknown, expected: unknown, message?: AssertionMessage): void {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    if (isDeepStrictEqual(actual, expected, optionsOf(this)?.skipPrototype)) {
      failure({
        actual,
        expected,
        message,
        operator: "notDeepStrictEqual",
        stackStartFn: AssertImplementation.prototype.notDeepStrictEqual,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  strictEqual<T>(actual: unknown, expected: T, message?: AssertionMessage): asserts actual is T {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    if (!Object.is(actual, expected)) {
      failure({
        actual,
        expected,
        message,
        operator: "strictEqual",
        stackStartFn: AssertImplementation.prototype.strictEqual,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  notStrictEqual(actual: unknown, expected: unknown, message?: AssertionMessage): void {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    if (Object.is(actual, expected)) {
      failure({
        actual,
        expected,
        message,
        operator: "notStrictEqual",
        stackStartFn: AssertImplementation.prototype.notStrictEqual,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  partialDeepStrictEqual(actual: unknown, expected: unknown, message?: AssertionMessage): void {
    if (arguments.length < 2) {
      throw missingArgs("actual", "expected");
    }
    if (!isPartialStrictEqual(actual, expected)) {
      failure({
        actual,
        expected,
        message,
        operator: "partialDeepStrictEqual",
        stackStartFn: AssertImplementation.prototype.partialDeepStrictEqual,
        diff: optionsOf(this)?.diff,
      });
    }
  }

  throws(fn: () => unknown, message?: AssertionMessage): void;
  throws(fn: () => unknown, error: AssertPredicate, message?: AssertionMessage): void;
  throws(
    fn: () => unknown,
    error?: AssertPredicate | AssertionMessage,
    message?: AssertionMessage,
  ): void {
    expectsError.call(
      this,
      AssertImplementation.prototype.throws,
      getActual(fn),
      error,
      message,
      arguments.length,
    );
  }

  rejects(
    promiseFn: (() => Promise<unknown>) | Promise<unknown>,
    message?: AssertionMessage,
  ): Promise<void>;
  rejects(
    promiseFn: (() => Promise<unknown>) | Promise<unknown>,
    error: AssertPredicate,
    message?: AssertionMessage,
  ): Promise<void>;
  async rejects(
    promiseFn: (() => Promise<unknown>) | Promise<unknown>,
    error?: AssertPredicate | AssertionMessage,
    message?: AssertionMessage,
  ): Promise<void> {
    expectsError.call(
      this,
      AssertImplementation.prototype.rejects,
      await waitForActual(promiseFn),
      error,
      message,
      arguments.length,
    );
  }

  doesNotThrow(fn: () => unknown, message?: AssertionMessage): void;
  doesNotThrow(fn: () => unknown, error: AssertPredicate, message?: AssertionMessage): void;
  doesNotThrow(
    fn: () => unknown,
    error?: AssertPredicate | AssertionMessage,
    message?: AssertionMessage,
  ): void {
    expectsNoError.call(
      this,
      AssertImplementation.prototype.doesNotThrow,
      getActual(fn),
      error,
      message,
    );
  }

  doesNotReject(
    fn: (() => Promise<unknown>) | Promise<unknown>,
    message?: AssertionMessage,
  ): Promise<void>;
  doesNotReject(
    fn: (() => Promise<unknown>) | Promise<unknown>,
    error: AssertPredicate,
    message?: AssertionMessage,
  ): Promise<void>;
  async doesNotReject(
    fn: (() => Promise<unknown>) | Promise<unknown>,
    error?: AssertPredicate | AssertionMessage,
    message?: AssertionMessage,
  ): Promise<void> {
    expectsNoError.call(
      this,
      AssertImplementation.prototype.doesNotReject,
      await waitForActual(fn),
      error,
      message,
    );
  }

  ifError(error: unknown): asserts error is null | undefined {
    if (error === null || error === undefined) {
      return;
    }
    const detail =
      error instanceof Error ? error.message || error.constructor.name : inspect(error);
    failure({
      actual: error,
      expected: null,
      operator: "ifError",
      message: `ifError got unwanted exception: ${detail}`,
      stackStartFn: AssertImplementation.prototype.ifError,
      diff: optionsOf(this)?.diff,
    });
  }

  match(value: string, regexp: RegExp, message?: AssertionMessage): void {
    internalMatch.call(this, value, regexp, message, true, AssertImplementation.prototype.match);
  }

  doesNotMatch(value: string, regexp: RegExp, message?: AssertionMessage): void {
    internalMatch.call(
      this,
      value,
      regexp,
      message,
      false,
      AssertImplementation.prototype.doesNotMatch,
    );
  }
}

export type Assert = AssertImplementation;

export type AssertStrict = Omit<Assert, "equal" | "deepEqual" | "notEqual" | "notDeepEqual"> & {
  equal: Assert["strictEqual"];
  deepEqual: Assert["deepStrictEqual"];
  notEqual: Assert["notStrictEqual"];
  notDeepEqual: Assert["notDeepStrictEqual"];
};

export interface AssertConstructor {
  new (options?: AssertOptions & { strict?: true }): AssertStrict;
  new (options: AssertOptions): Assert;
  readonly prototype: Assert;
}

// Node implements Assert as a constructor function. The proxy preserves its
// constructor-only call contract while the cast exposes the upstream overloads
// that depend on the `strict` option.
export const Assert = new Proxy(AssertImplementation, {
  apply(): never {
    throw constructCallRequired("Assert");
  },
}) as unknown as AssertConstructor;

function getActual(fn: unknown): unknown {
  validateFunction(fn, "fn");
  try {
    fn();
  } catch (error) {
    return error;
  }
  return noException;
}

function isPromise(value: unknown): value is PromiseLike<unknown> {
  return value instanceof Promise;
}

async function waitForActual(value: unknown): Promise<unknown> {
  let promise: unknown;
  if (typeof value === "function") {
    promise = value();
  } else {
    promise = value;
  }
  if (!isPromise(promise)) {
    if (typeof value !== "function" && !isPromise(value)) {
      throw invalidArgType("promiseFn", ["Function", "Promise"], value);
    }
    throw invalidReturnValue("instance of Promise", "promiseFn", promise);
  }
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return noException;
}

function matchExpected(
  actual: unknown,
  expected: unknown,
  owner: unknown,
  fn: UnknownFunction,
  message?: AssertionMessage,
): boolean {
  if (expected instanceof RegExp) {
    return expected.exec(String(actual)) !== null;
  }
  if (typeof expected === "function") {
    const candidate = expected as UnknownFunction & { prototype?: object };
    const constructor = candidate as unknown as new (...args: never[]) => object;
    if (candidate.prototype !== undefined && actual instanceof constructor) {
      return true;
    }
    if (Error.isPrototypeOf(expected)) {
      return false;
    }
    return expected.call({}, actual) === true;
  }
  if (expected === null || typeof expected !== "object") {
    throw invalidArgType("error", ["Object", "Error", "Function", "RegExp"], expected);
  }
  const keys = Object.keys(expected);
  if (expected instanceof Error) {
    keys.push("name", "message");
  } else if (keys.length === 0) {
    throw invalidArgValue("error", expected, "may not be an empty object");
  }
  if (actual === null || typeof actual !== "object") {
    return false;
  }
  for (const key of keys) {
    const expectedValue = property(expected, key);
    const actualValue = property(actual, key);
    if (
      typeof actualValue === "string" &&
      expectedValue instanceof RegExp &&
      expectedValue.exec(actualValue)
    ) {
      continue;
    }
    if (!isDeepStrictEqual(actualValue, expectedValue)) {
      failure({
        actual,
        expected,
        message,
        operator: fn.name,
        stackStartFn: fn,
        diff: optionsOf(owner)?.diff,
      });
    }
  }
  return true;
}

function expectsError(
  this: AssertImplementation | undefined,
  fn: UnknownFunction,
  actual: unknown,
  error: unknown,
  message: AssertionMessage,
  argumentCount: number,
): void {
  if (typeof error === "string") {
    if (argumentCount >= 3) {
      throw invalidArgType("error", ["Object", "Error", "Function", "RegExp"], error);
    }
    if (messageOf(actual) === error || actual === error) {
      throw ambiguousArgument(
        "error/message",
        `The error message "${error}" is identical to the message.`,
      );
    }
    message = error;
    error = undefined;
  }
  if (actual === noException) {
    failure({
      actual: undefined,
      expected: error,
      operator: fn.name,
      message: `Missing expected ${fn.name === "rejects" ? "rejection" : "exception"}${message ? `: ${message}` : "."}`,
      stackStartFn: fn,
      diff: optionsOf(this)?.diff,
    });
  }
  if (error === undefined || error === null) {
    return;
  }
  if (!matchExpected(actual, error, this, fn, message)) {
    failure({
      actual,
      expected: error,
      message,
      operator: fn.name,
      stackStartFn: fn,
      diff: optionsOf(this)?.diff,
    });
  }
}

function expectsNoError(
  this: AssertImplementation | undefined,
  fn: UnknownFunction,
  actual: unknown,
  error?: AssertPredicate | AssertionMessage,
  message?: AssertionMessage,
): void {
  if (actual === noException) {
    return;
  }
  if (typeof error === "string") {
    message = error;
    error = undefined;
  }
  if (error === undefined || matchExpected(actual, error, this, fn, message)) {
    failure({
      actual,
      expected: error,
      operator: fn.name,
      message: `Got unwanted ${fn.name === "doesNotReject" ? "rejection" : "exception"}${message ? `: ${message}` : "."}\nActual message: "${String(messageOf(actual))}"`,
      stackStartFn: fn,
      diff: optionsOf(this)?.diff,
    });
  }
  throw actual;
}

function internalMatch(
  this: AssertImplementation | undefined,
  value: unknown,
  regexp: unknown,
  message: AssertionMessage,
  shouldMatch: boolean,
  fn: UnknownFunction,
): void {
  if (!(regexp instanceof RegExp)) {
    throw invalidArgType("regexp", "RegExp", regexp);
  }
  const matches = typeof value === "string" && regexp.exec(value) !== null;
  if (matches === shouldMatch) {
    return;
  }
  if (message instanceof Error) {
    throw message;
  }
  const generated = message == null;
  const text =
    message ??
    (typeof value !== "string"
      ? `The "string" argument must be of type string. Received type ${typeof value} (${inspect(value)})`
      : `The input ${shouldMatch ? "did not match" : "was expected to not match"} the regular expression ${inspect(regexp)}. Input:\n\n${inspect(value)}\n`);
  const error = new AssertionError({
    actual: value,
    expected: regexp,
    message: text,
    operator: fn.name,
    stackStartFn: fn,
    diff: optionsOf(this)?.diff,
  });
  error.generatedMessage = generated;
  throw error;
}

export const fail = AssertImplementation.prototype.fail;
export const equal = AssertImplementation.prototype.equal;
export const notEqual = AssertImplementation.prototype.notEqual;
export const deepEqual = AssertImplementation.prototype.deepEqual;
export const notDeepEqual = AssertImplementation.prototype.notDeepEqual;
export const deepStrictEqual = AssertImplementation.prototype.deepStrictEqual;
export const notDeepStrictEqual = AssertImplementation.prototype.notDeepStrictEqual;
export const strictEqual = AssertImplementation.prototype.strictEqual;
export const notStrictEqual = AssertImplementation.prototype.notStrictEqual;
export const partialDeepStrictEqual = AssertImplementation.prototype.partialDeepStrictEqual;
export const throws = AssertImplementation.prototype.throws;
export const rejects = AssertImplementation.prototype.rejects;
export const doesNotThrow = AssertImplementation.prototype.doesNotThrow;
export const doesNotReject = AssertImplementation.prototype.doesNotReject;
export const ifError = AssertImplementation.prototype.ifError;
export const match = AssertImplementation.prototype.match;
export const doesNotMatch = AssertImplementation.prototype.doesNotMatch;

export function ok(value: unknown, message?: AssertionMessage): asserts value {
  innerOk(value, message, arguments.length, ok);
}

type AssertModule = typeof ok & {
  AssertionError: typeof AssertionError;
  Assert: typeof Assert;
  CallTracker: typeof CallTracker;
  ok: typeof ok;
  fail: typeof fail;
  equal: typeof equal;
  notEqual: typeof notEqual;
  deepEqual: typeof deepEqual;
  notDeepEqual: typeof notDeepEqual;
  deepStrictEqual: typeof deepStrictEqual;
  notDeepStrictEqual: typeof notDeepStrictEqual;
  strictEqual: typeof strictEqual;
  notStrictEqual: typeof notStrictEqual;
  partialDeepStrictEqual: typeof partialDeepStrictEqual;
  throws: typeof throws;
  rejects: typeof rejects;
  doesNotThrow: typeof doesNotThrow;
  doesNotReject: typeof doesNotReject;
  ifError: typeof ifError;
  match: typeof match;
  doesNotMatch: typeof doesNotMatch;
  strict: AssertModule;
};

const base = {
  AssertionError,
  Assert,
  CallTracker,
  ok,
  fail,
  equal,
  notEqual,
  deepEqual,
  notDeepEqual,
  deepStrictEqual,
  notDeepStrictEqual,
  strictEqual,
  notStrictEqual,
  partialDeepStrictEqual,
  throws,
  rejects,
  doesNotThrow,
  doesNotReject,
  ifError,
  match,
  doesNotMatch,
};

const strictFunction = function strict(value?: unknown, message?: AssertionMessage): asserts value {
  innerOk(value, message, arguments.length, strictFunction);
};

export const strict = Object.assign(strictFunction, base, {
  equal: strictEqual,
  deepEqual: deepStrictEqual,
  notEqual: notStrictEqual,
  notDeepEqual: notDeepStrictEqual,
}) as AssertModule;
strict.strict = strict;

const assert = Object.assign(ok, base, { strict }) as AssertModule;
assert.ok = assert;

export { AssertionError, CallTracker };
export default assert;
