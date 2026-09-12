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

// Adapted validators and stream predicates from nodejs/node v24.20.0,
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/validators.js and
// lib/internal/streams/utils.js. Local changes: narrow types and shared Jco errors.

import { validateInteger } from "../internal/validation.js";
import type { WritableOutput } from "./types.js";

// Adapted from Node v24.20.0 lib/internal/streams/utils.js, same pin and MIT
// notice as actions.ts. Only the predicates needed by Readline are included.
export function isWritable(stream: unknown): stream is WritableOutput {
  if (stream === null || typeof stream !== "object") {
    return false;
  }
  const value = stream as {
    write?: unknown;
    on?: unknown;
    writable?: unknown;
    destroyed?: unknown;
    writableEnded?: unknown;
    _readableState?: { destroyed?: boolean };
    _writableState?: {
      writable?: boolean;
      destroyed?: boolean;
      ended?: boolean;
      errored?: unknown;
    };
    [key: symbol]: unknown;
  };
  const explicit = value[Symbol.for("nodejs.stream.writable")];
  if (explicit != null) {
    return !!explicit;
  }
  if (typeof value.writable !== "boolean") {
    return false;
  }
  const state = value._writableState || value._readableState;
  if (value.destroyed || value[Symbol.for("nodejs.stream.destroyed")] || state?.destroyed) {
    return false;
  }
  const writable =
    typeof value.write === "function" &&
    typeof value.on === "function" &&
    (!value._readableState || value._writableState?.writable !== false);
  const ended =
    value.writableEnded === true ||
    (!value._writableState?.errored && value._writableState?.ended === true);
  return writable && value.writable && !ended;
}

/** Diagnostic formatting only; do not import Node's host-specific util implementation. */
export function inspect(value: unknown): string {
  return String(value);
}

export function validateUint32(
  value: unknown,
  name: string,
  positive = false,
): asserts value is number {
  validateInteger(value, name, positive ? 1 : 0, 0xffff_ffff);
}

/** QuickJS exposes promise jobs even when queueMicrotask is not installed. */
export function defer(callback: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
  } else {
    void Promise.resolve().then(callback);
  }
}
