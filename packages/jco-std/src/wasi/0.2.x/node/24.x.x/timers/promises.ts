/**
 * Adapted from nodejs/node lib/timers/promises.js, v24.20.0,
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

import { AbortError, illegalConstructor, invalidArgType, invalidThis } from "../errors/core.js";
import { validateObject } from "../internal/validation.js";
import * as timers from "./callbacks.js";
import type { Timeout, Immediate } from "./handles.js";

export interface TimerOptions {
  signal?: AbortSignal;
  ref?: boolean;
}

function validateOptions(options: TimerOptions, delay?: number): void {
  if (delay !== undefined && typeof delay !== "number") {
    throw invalidArgType("delay", "number", delay);
  }
  validateObject(options, "options");
  const signal = options.signal;
  // Like Node's validator, accept cross-realm signals by their aborted property.
  if (
    signal !== undefined &&
    (signal === null || typeof signal !== "object" || !("aborted" in signal))
  ) {
    throw invalidArgType("options.signal", "AbortSignal", signal);
  }
  if (options.ref !== undefined && typeof options.ref !== "boolean") {
    throw invalidArgType("options.ref", "boolean", options.ref);
  }
}

async function wait<T>(
  kind: "timeout" | "immediate",
  value: T,
  options: TimerOptions,
  delay?: number,
): Promise<T> {
  validateOptions(options, delay);
  const { signal, ref = true } = options;
  if (signal?.aborted) {
    throw new AbortError(undefined, { cause: signal.reason });
  }
  let timer: Timeout | Immediate | undefined;
  let oncancel: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer =
        kind === "timeout"
          ? timers.setTimeout(resolve, delay, value)
          : timers.setImmediate(resolve, value);
      if (!ref) {
        timer.unref();
      }
      if (signal) {
        oncancel = () => {
          timer?.[Symbol.dispose]();
          reject(new AbortError(undefined, { cause: signal.reason }));
        };
        signal.addEventListener("abort", oncancel);
      }
    });
  } finally {
    timer?.[Symbol.dispose]();
    if (oncancel) {
      signal!.removeEventListener("abort", oncancel);
    }
  }
}

export function setTimeout<T = void>(
  delay?: number,
  value?: T,
  options: TimerOptions = {},
): Promise<T> {
  return wait("timeout", value as T, options, delay);
}

export function setImmediate<T = void>(value?: T, options: TimerOptions = {}): Promise<T> {
  return wait("immediate", value as T, options);
}

export async function* setInterval<T = void>(
  delay?: number,
  value?: T,
  options: TimerOptions = {},
): AsyncGenerator<T, void, unknown> {
  validateOptions(options, delay);
  const { signal, ref = true } = options;
  if (signal?.aborted) {
    throw new AbortError(undefined, { cause: signal.reason });
  }
  let onCancel: (() => void) | undefined;
  let interval: Timeout | undefined;
  try {
    let notYielded = 0;
    let callback: ((value?: PromiseLike<void>) => void) | undefined;
    interval = timers.setInterval(() => {
      notYielded++;
      if (callback) {
        callback();
        callback = undefined;
      }
    }, delay);
    if (!ref) {
      interval.unref();
    }
    if (signal) {
      onCancel = () => {
        timers.clearInterval(interval);
        if (callback) {
          callback(Promise.reject(new AbortError(undefined, { cause: signal.reason })));
          callback = undefined;
        }
      };
      signal.addEventListener("abort", onCancel, { once: true });
    }
    while (!signal?.aborted) {
      if (notYielded === 0) {
        await new Promise<void>((resolve) => {
          callback = resolve;
        });
      }
      for (; notYielded > 0; notYielded--) {
        yield value as T;
      }
    }
    throw new AbortError(undefined, { cause: signal?.reason });
  } finally {
    timers.clearInterval(interval);
    if (onCancel) {
      signal!.removeEventListener("abort", onCancel);
    }
  }
}

const kScheduler = Symbol("kScheduler");
class Scheduler {
  constructor() {
    throw illegalConstructor();
  }
  yield(): Promise<void> {
    if (!this[kScheduler]) {
      throw invalidThis("Scheduler");
    }
    return setImmediate();
  }
  wait(delay: number, options?: TimerOptions): Promise<void> {
    if (!this[kScheduler]) {
      throw invalidThis("Scheduler");
    }
    return setTimeout(delay, undefined, options);
  }
  declare [kScheduler]: boolean;
}
export interface TimerScheduler {
  yield(): Promise<void>;
  wait(delay: number, options?: TimerOptions): Promise<void>;
}
export const scheduler: TimerScheduler = Object.assign(Object.create(Scheduler.prototype), {
  [kScheduler]: true,
});

const promises = { setTimeout, setImmediate, setInterval, scheduler };
export default promises;
