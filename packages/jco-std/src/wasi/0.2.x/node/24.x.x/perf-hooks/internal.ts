/**
 * Adapted from Node.js lib/internal/perf/performance.js / usertiming.js at v24.20.0,
 * commit 71b8b174857e25106d39b61a9e6f30d927da8b01.
 * TypeScript adaptation: ECMAScript builtins replace primordials; runtime clocks,
 * cloning and scheduling replace Node internals. Native telemetry is unsupported.
 *
 * Copyright Node.js contributors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */
import { codedError, invalidArgType, invalidThis, unsupportedNodeApi } from "../errors/core.js";

/** Refuse a perf_hooks API the engine cannot support, naming why. */
export function unsupported(api: string, reason: string): never {
  throw unsupportedNodeApi(`node:perf_hooks ${api}`, reason);
}
export function timestamp(value: unknown): asserts value is number {
  if (typeof value !== "number") {
    throw invalidArgType("startTime", "number", value);
  }
  if (value < 0) {
    throw codedError(
      new TypeError(`${value} is not a valid timestamp`),
      "ERR_PERFORMANCE_INVALID_TIMESTAMP",
    );
  }
}
export function enumerable(prototype: object, names: string[], tag?: string): void {
  for (const name of names) {
    Object.defineProperty(prototype, name, { enumerable: true });
  }
  if (tag) {
    Object.defineProperty(prototype, Symbol.toStringTag, { configurable: true, value: tag });
  }
}
export function now(): number {
  if (typeof globalThis.performance?.now !== "function") {
    unsupported("performance.now", "the engine has no monotonic clock");
  }
  return globalThis.performance.now();
}
export function clone(value: unknown): unknown {
  if (value == null) {
    return null;
  }
  if (typeof globalThis.structuredClone !== "function") {
    unsupported("detail cloning", "the engine has no structuredClone");
  }
  return globalThis.structuredClone(value);
}
export const kSkipThrow: unique symbol = Symbol("kSkipThrow");

// Node checks the receiver of every method and accessor before reading arguments, so a forged
// `this` fails with ERR_INVALID_THIS rather than a private-field TypeError. Brands are recorded per
// instance because `instanceof` can be forged through the prototype chain.
const brands = new WeakMap<object, Set<string>>();
export function brand(value: object, name: string): void {
  let names = brands.get(value);
  if (!names) {
    names = new Set();
    brands.set(value, names);
  }
  names.add(name);
}
export function check(value: unknown, name: string): void {
  if (!brands.get(value as object)?.has(name)) {
    throw invalidThis(name);
  }
}

/** Narrow DOMException fallback for engines without the Web constructor. */
export function domException(
  message: string,
  name: "SyntaxError" | "InvalidModificationError",
): Error & { readonly code: number } {
  if (typeof globalThis.DOMException === "function") {
    return new globalThis.DOMException(message, name);
  }
  const error = new Error(message);
  error.name = name;
  return Object.assign(error, { code: name === "SyntaxError" ? 12 : 13 });
}
