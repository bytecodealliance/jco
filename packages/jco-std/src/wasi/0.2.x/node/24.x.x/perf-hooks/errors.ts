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
import { codedError, invalidArgType } from "../errors/core.js";

export function coded<T extends Error>(error: T, code: string): T & { code: string } {
  return codedError(error, code);
}
export function unsupported(api: string): never {
  throw coded(
    new Error(`node:perf_hooks ${api} is not supported in a WebAssembly component`),
    "ERR_JCO_UNSUPPORTED_NODE_API",
  );
}
export function illegal(): never {
  throw coded(new TypeError("Illegal constructor"), "ERR_ILLEGAL_CONSTRUCTOR");
}
export function missing(name: string): never {
  throw coded(new TypeError(`The "${name}" argument must be specified`), "ERR_MISSING_ARGS");
}
export function object(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(name, "Object", value);
  }
}
export function invalid(name: string, type: string, value: unknown): never {
  throw invalidArgType(name, type, value);
}
export function timestamp(value: unknown): asserts value is number {
  if (typeof value !== "number") {
    invalid("startTime", "number", value);
  }
  if (value < 0) {
    throw coded(
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
    unsupported("performance.now (runtime monotonic clock required)");
  }
  return globalThis.performance.now();
}
export function clone(value: unknown): unknown {
  if (value == null) {
    return null;
  }
  if (typeof globalThis.structuredClone !== "function") {
    unsupported("detail cloning (runtime structuredClone required)");
  }
  return globalThis.structuredClone(value);
}
export const kSkipThrow: unique symbol = Symbol("kSkipThrow");

// Node validates internal fields before inspecting method arguments. A WeakMap
// retains that ordering without exposing the private fields in public declarations.
const brands = new WeakMap<object, Set<string>>();
export function registerBrand(value: object, name: string): void {
  let names = brands.get(value);
  if (!names) {
    names = new Set();
    brands.set(value, names);
  }
  names.add(name);
}
export function brandPrototype(prototype: object, name: string): void {
  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === "constructor" || key === "kind" || key === "flags") {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (!descriptor) {
      continue;
    }
    for (const field of ["value", "get", "set"] as const) {
      const original: unknown = descriptor[field];
      if (typeof original !== "function") {
        continue;
      }
      descriptor[field] = function (this: unknown, ...args: unknown[]): unknown {
        if (
          (typeof this !== "object" && typeof this !== "function") ||
          this === null ||
          !brands.get(this)?.has(name)
        ) {
          throw coded(new TypeError(`Value of "this" must be of type ${name}`), "ERR_INVALID_THIS");
        }
        return Reflect.apply(original, this, args);
      };
      Object.defineProperty(descriptor[field], "name", {
        value: original.name,
        configurable: true,
      });
      Object.defineProperty(descriptor[field], "length", {
        value: original.length,
        configurable: true,
      });
    }
    Object.defineProperty(prototype, key, descriptor);
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
