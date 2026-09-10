/**
 * Adapted from nodejs/node lib/internal/timers.js and lib/timers.js, v24.20.0,
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

import { schedule, type RuntimeTimer } from "./runtime.js";

let nextId = 1;
const knownTimersById = new Map<number, Timeout>();

/** Node delay coercion, with warning emission omitted (no implicit process capability). */
export function normalizeDelay(after: number | undefined): number {
  const value = after === undefined ? 1 : after * 1;
  return value >= 1 && value <= 2 ** 31 - 1 ? Math.trunc(value) : 1;
}

export class Timeout implements Disposable {
  #timer?: RuntimeTimer;
  #callback?: (this: Timeout) => void;
  #delay: number;
  #repeat: boolean;
  #refed = true;
  #id = nextId++;
  #primitive = false;
  #fired = false;

  constructor(callback: (this: Timeout) => void, delay: number | undefined, repeat: boolean) {
    this.#callback = callback;
    this.#delay = normalizeDelay(delay);
    this.#repeat = repeat;
    this.#start();
  }

  #start(): void {
    this.#timer = schedule(
      () => {
        if (!this.#repeat) {
          this.#timer = undefined;
          this.#fired = true;
          knownTimersById.delete(this.#id);
        }
        this.#callback?.call(this);
      },
      this.#delay,
      this.#repeat ? "interval" : "timeout",
    );
    try {
      this.#timer.setRef(this.#refed);
    } catch (error) {
      this.#timer.cancel();
      this.#timer = undefined;
      throw error;
    }
  }

  refresh(): this {
    if (!this.#callback) {
      return this;
    }
    this.#timer?.cancel();
    if (this.#fired) {
      this.#id = nextId++;
      this.#fired = false;
      if (this.#primitive) {
        knownTimersById.set(this.#id, this);
      }
    }
    this.#start();
    return this;
  }

  unref(): this {
    this.#timer?.setRef(false);
    this.#refed = false;
    return this;
  }

  ref(): this {
    this.#timer?.setRef(true);
    this.#refed = true;
    return this;
  }

  hasRef(): boolean {
    return this.#refed;
  }

  // close is legacy, not deprecated in Node 24.
  close(): this {
    this.#timer?.cancel();
    this.#timer = undefined;
    this.#callback = undefined;
    knownTimersById.delete(this.#id);
    return this;
  }

  [Symbol.dispose](): void {
    this.close();
  }

  [Symbol.toPrimitive](): number {
    if (!this.#primitive && this.#callback && !this.#fired) {
      this.#primitive = true;
      knownTimersById.set(this.#id, this);
    }
    return this.#id;
  }
}

export function cancelTimeout(timer: unknown): void {
  if (timer instanceof Timeout) {
    timer.close();
  } else if (typeof timer === "number" || typeof timer === "string") {
    // Node's ID table uses exact property keys, not general numeric coercion.
    const id = typeof timer === "number" ? timer : Number(timer);
    if (typeof timer === "string" && String(id) !== timer) {
      return;
    }
    knownTimersById.get(id)?.close();
  }
}

export class Immediate implements Disposable {
  #timer?: RuntimeTimer;
  #callback?: (this: Immediate) => void;
  #refed = true;

  constructor(callback: (this: Immediate) => void) {
    this.#callback = callback;
    this.#timer = schedule(
      () => {
        const fn = this.#callback;
        this.#callback = undefined;
        this.#timer = undefined;
        this.#refed = false;
        fn?.call(this);
      },
      0,
      "immediate",
    );
  }

  ref(): this {
    if (this.#timer) {
      this.#timer.setRef(true);
      this.#refed = true;
    }
    return this;
  }

  unref(): this {
    if (this.#timer) {
      this.#timer.setRef(false);
      this.#refed = false;
    }
    return this;
  }

  hasRef(): boolean {
    return this.#refed;
  }

  [Symbol.dispose](): void {
    this.#timer?.cancel();
    this.#timer = undefined;
    this.#callback = undefined;
    this.#refed = false;
  }
}

// Node installs these members by assignment, unlike the class-defined methods.
for (const [prototype, keys] of [
  [Timeout.prototype, ["close", Symbol.dispose, Symbol.toPrimitive]],
  [Immediate.prototype, [Symbol.dispose]],
] as const) {
  for (const key of keys) {
    Object.defineProperty(prototype, key, { enumerable: true });
  }
}
