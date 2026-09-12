/**
 * Adapted from nodejs/node lib/timers.js, v24.20.0,
 * commit 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT).
 * TypeScript and engine task timers replace primordials and native scheduling.
 * No native async hooks, process warnings, or private abort event flags.
 */
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

import { validateFunction } from "../internal/validation.js";
import { Timeout, Immediate, cancelTimeout } from "./handles.js";

export function setTimeout<T extends unknown[]>(
  callback: (...args: T) => void,
  delay?: number,
  ...args: T
): Timeout {
  validateFunction(callback, "callback");
  return new Timeout(
    function () {
      Reflect.apply(callback, this, args);
    },
    delay,
    false,
  );
}

export function setInterval<T extends unknown[]>(
  callback: (...args: T) => void,
  delay?: number,
  ...args: T
): Timeout {
  validateFunction(callback, "callback");
  return new Timeout(
    function () {
      Reflect.apply(callback, this, args);
    },
    delay,
    true,
  );
}

export function setImmediate<T extends unknown[]>(
  callback: (...args: T) => void,
  ...args: T
): Immediate {
  validateFunction(callback, "callback");
  return new Immediate(function () {
    Reflect.apply(callback, this, args);
  });
}

export function clearTimeout(timer: Timeout | number | string | undefined): void {
  cancelTimeout(timer);
}
export function clearInterval(timer: Timeout | number | string | undefined): void {
  cancelTimeout(timer);
}
export function clearImmediate(immediate: Immediate | undefined): void {
  if (immediate instanceof Immediate) {
    immediate[Symbol.dispose]();
  }
}
