/**
 * Adapted from Node.js lib/internal/perf/timerify.js at v24.20.0,
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
import { invalid, kSkipThrow, now, object } from "./internal.js";
import { PerformanceNodeEntry } from "./entries.js";
import { enqueue } from "./observe.js";
export interface TimerifyOptions {
  histogram?: never;
}
// Generic callable/constructible identity preserves overloads, this and result types.
export function timerify<
  T extends ((...args: never[]) => unknown) | (new (...args: never[]) => object),
>(fn: T, options: TimerifyOptions = {}): T {
  if (typeof fn !== "function") {
    invalid("fn", "function", fn);
  }
  object(options, "options");
  if (options.histogram !== undefined) {
    invalid("options.histogram", "RecordableHistogram", options.histogram);
  }
  function complete(start: number, args: unknown[]): void {
    const entry = new PerformanceNodeEntry(
      kSkipThrow,
      fn.name,
      "function",
      start,
      now() - start,
      args,
    );
    // Node also exposes the arguments as indexed own properties of the entry.
    Object.assign(entry, args);
    enqueue(entry);
  }
  function timerified(this: unknown, ...args: unknown[]): unknown {
    const start = now();
    const result: unknown = new.target
      ? Reflect.construct(fn, args, fn)
      : Reflect.apply(fn, this, args);
    // A thenable result is timed at settlement; construction never is.
    const finish = new.target ? undefined : (result as { finally?: unknown } | null)?.finally;
    if (typeof finish === "function") {
      return Reflect.apply(finish, result as object, [() => complete(start, args)]);
    }
    complete(start, args);
    return result;
  }
  Object.defineProperties(timerified, {
    length: { configurable: false, enumerable: true, value: fn.length },
    name: { configurable: false, enumerable: true, value: `timerified ${fn.name}` },
  });
  return timerified as unknown as T;
}
