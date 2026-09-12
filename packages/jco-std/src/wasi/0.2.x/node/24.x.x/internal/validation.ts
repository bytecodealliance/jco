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

// Shared validators adapted from Node.js v24.20.0 lib/internal/validators.js (MIT),
// commit 71b8b174857e25106d39b61a9e6f30d927da8b01. Uses typed assertions and
// jco-std error factories; preserves the existing adapters' accepted values and errors.
import { invalidArgType, invalidArgValue, outOfRange } from "../errors/core.js";

export function validateFunction(
  value: unknown,
  name: string,
): asserts value is (...args: unknown[]) => unknown {
  if (typeof value !== "function") {
    throw invalidArgType(name, "Function", value);
  }
}

interface ObjectValidationOptions {
  allowArray?: boolean;
}

// Preserve known option shapes while giving unknown inputs an indexable object type.
export function validateObject<T extends object>(
  value: T,
  name: string,
  options?: ObjectValidationOptions,
): asserts value is T;

export function validateObject(
  value: unknown,
  name: string,
  options?: ObjectValidationOptions,
): asserts value is Record<PropertyKey, unknown>;

export function validateObject(
  value: unknown,
  name: string,
  options: ObjectValidationOptions = {},
): asserts value is Record<PropertyKey, unknown> {
  // Node's default also rejects arrays.
  if (
    value === null ||
    typeof value !== "object" ||
    (!options.allowArray && Array.isArray(value))
  ) {
    throw invalidArgType(name, "Object", value);
  }
}

export function validateOneOf<T>(value: T, name: string, allowed: readonly T[]): void {
  if (!allowed.includes(value)) {
    throw invalidArgValue(name, value, `must be one of: ${allowed.map(String).join(", ")}`);
  }
}

// Existing callers report a range error even for non-numbers. Readline uses
// validateInteger instead to retain its separate type and fraction errors.
export function validateUint32(
  value: unknown,
  name: string,
  positive = false,
): asserts value is number {
  const minimum = positive ? 1 : 0;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > 0xffff_ffff) {
    throw outOfRange(name, `>= ${minimum} and <= 4294967295`, value);
  }
}

export function validateString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    throw invalidArgType(name, "string", value);
  }
}

export function validateBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw invalidArgType(name, "boolean", value);
  }
}

export function validateInteger(
  value: unknown,
  name: string,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  validateNumber(value, name);
  if (!Number.isInteger(value)) {
    throw outOfRange(name, "an integer", value);
  }
  if (value < min || value > max) {
    throw outOfRange(name, `>= ${min} && <= ${max}`, value);
  }
}

// Readline only requires the aborted flag; stream consumers additionally require
// event methods and keep their stricter validator in stream/shared.ts.
export function validateAbortSignal(signal: unknown, name: string): asserts signal is AbortSignal {
  if (
    signal === null ||
    typeof signal !== "object" ||
    !("aborted" in signal) ||
    typeof signal.aborted !== "boolean"
  ) {
    throw invalidArgType(name, "AbortSignal", signal);
  }
}

export function validateArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw invalidArgType(name, "Array", value);
  }
}

export function validateStringArray(value: unknown, name: string): asserts value is string[] {
  validateArray(value, name);
  value.forEach((v, i) => validateString(v, `${name}[${i}]`));
}

export function validateBooleanArray(value: unknown, name: string): asserts value is boolean[] {
  validateArray(value, name);
  value.forEach((v, i) => validateBoolean(v, `${name}[${i}]`));
}

export function validateNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number") {
    throw invalidArgType(name, "number", value);
  }
}
