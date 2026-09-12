// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// Adapted from nodejs/node v24.20.0, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/util.js.
// Local changes: explicit TypeScript contracts, shared Jco errors, ECMAScript intrinsics.

import { codedError, deprecatedNodeApi, invalidArgType } from "../errors/core.js";
import { validateFunction } from "../internal/validation.js";
import { nextTick } from "../stream/scheduler.js";

type Callback<T> = (error: unknown, value?: T) => void;

type ResultCallback<T> = (error: unknown, value: T) => void;

type Callable = (...args: never[]) => unknown;

export interface CustomPromisified<T extends Callable> {
  [promisify.custom]: T;
}

const promisifyCustom: unique symbol = Symbol.for("nodejs.util.promisify.custom");

export interface Promisify {
  <T extends Callable>(original: CustomPromisified<T>): T;

  <A extends unknown[], R>(
    original: (...args: [...A, Callback<R>]) => unknown,
  ): (...args: A) => Promise<R>;

  (original: Callable): Callable;

  custom: typeof promisifyCustom;
}

function promisifyImpl<T extends Callable>(original: CustomPromisified<T>): T;

function promisifyImpl<A extends unknown[], R>(
  original: (...args: [...A, Callback<R>]) => unknown,
): (...args: A) => Promise<R>;

function promisifyImpl(original: Callable): Callable;

function promisifyImpl(original: unknown): Callable {
  validateFunction(original, "original");
  const custom = Reflect.get(original, promisify.custom) as unknown;
  if (custom) {
    validateFunction(custom, "util.promisify.custom");
    return Object.defineProperty(custom, promisify.custom, { value: custom, configurable: true });
  }
  // Calling a known async function is already a deprecated promisify call shape.
  // Refuse before invoking it, rather than emitting a warning after its side effects.
  if (Object.prototype.toString.call(original) === "[object AsyncFunction]") {
    throw deprecatedNodeApi(
      "util.promisify(async function)",
      "call the promise-returning function directly",
    );
  }
  const invoke = original;

  function fn(this: unknown, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      args.push((error: unknown, value: unknown): void => {
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      });
      Reflect.apply(invoke, this, args);
    });
  }

  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));
  Object.defineProperty(fn, promisify.custom, { value: fn, configurable: true });
  return Object.defineProperties(fn, Object.getOwnPropertyDescriptors(original));
}

export const promisify: Promisify = Object.assign(promisifyImpl, {
  custom: promisifyCustom,
} satisfies { custom: typeof promisifyCustom });
Object.defineProperty(promisify, "name", { value: "promisify" });

export function callbackify<A extends unknown[], R>(
  original: (...args: A) => Promise<R>,
): (...args: [...A, ResultCallback<R>]) => void {
  validateFunction(original, "original");

  function callbackified(this: unknown, ...args: [...A, ResultCallback<R>]): void {
    const callback = args.pop();
    validateFunction(callback, "last argument");
    const cb = callback.bind(this);
    const promise = Reflect.apply(original, this, args) as Promise<R>;
    promise.then(
      (value: R): void => nextTick(cb, null, value),
      (reason: unknown): void =>
        nextTick((): void => {
          if (!reason) {
            const error = codedError(
              new Error("Promise was rejected with falsy value"),
              "ERR_FALSY_VALUE_REJECTION",
            );
            Object.assign(error, { reason });
            reason = error;
          }
          cb(reason);
        }),
    );
  }

  const descriptors = Object.getOwnPropertyDescriptors(original);
  if (typeof descriptors.length?.value === "number") {
    descriptors.length.value++;
  }
  if (typeof descriptors.name?.value === "string") {
    descriptors.name.value += "Callbackified";
  }
  Object.defineProperties(callbackified, descriptors);
  return callbackified;
}

export function inherits(ctor: { prototype: object }, superCtor: { prototype: object }): void {
  if (ctor === undefined || ctor === null) {
    throw invalidArgType("ctor", "Function", ctor);
  }
  if (superCtor === undefined || superCtor === null) {
    throw invalidArgType("superCtor", "Function", superCtor);
  }
  if (superCtor.prototype === undefined) {
    throw invalidArgType("superCtor.prototype", "Object", undefined);
  }
  Object.defineProperty(ctor, "super_", { value: superCtor, writable: true, configurable: true });
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}
