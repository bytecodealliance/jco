/**
 * Adapted from Node.js lib/internal/perf/usertiming.js at v24.20.0,
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
import {
  brand,
  check,
  clone,
  coded,
  domException,
  enumerable,
  illegal,
  invalid,
  kSkipThrow,
  missing,
  now,
  object,
  timestamp,
  unsupported,
} from "./internal.js";
import { PerformanceEntry, type EntryJSON } from "./entries.js";
import { enqueue, bufferEntry } from "./observe.js";
export interface MarkOptions {
  detail?: unknown;
  startTime?: number;
}
export interface MeasureOptions {
  detail?: unknown;
  start?: string | number;
  end?: string | number;
  duration?: number;
}
const markTimings = new Map<string, number>();
const reserved = new Set([
  "nodeStart",
  "v8Start",
  "environment",
  "loopStart",
  "loopExit",
  "bootstrapComplete",
]);
function checkName(name: string): void {
  if (reserved.has(name)) {
    throw coded(
      new TypeError(`The argument 'name' is invalid. Received '${name}'`),
      "ERR_INVALID_ARG_VALUE",
    );
  }
}
function getMark(value: string | number): number {
  if (typeof value === "number") {
    timestamp(value);
    return value;
  }
  const name = `${value}`;
  if (reserved.has(name)) {
    unsupported(`performance.nodeTiming.${name}`);
  }
  const ts = markTimings.get(name);
  if (ts === undefined) {
    throw domException(`The "${name}" performance mark has not been set`, "SyntaxError");
  }
  return ts;
}
export class PerformanceMark extends PerformanceEntry {
  #detail: unknown;
  constructor(name: string, options?: MarkOptions) {
    if (!arguments.length) {
      missing("name");
    }
    name = `${name}`;
    checkName(name);
    if (options != null) {
      object(options, "options");
    }
    const start = options?.startTime ?? now();
    timestamp(start);
    markTimings.set(name, start);
    const detail = clone(options?.detail);
    super(kSkipThrow, name, "mark", start, 0);
    brand(this, "PerformanceMark");
    this.#detail = detail;
  }
  get detail(): unknown {
    check(this, "PerformanceMark");
    return this.#detail;
  }
  override toJSON(): EntryJSON {
    check(this, "PerformanceMark");
    return { ...super.toJSON(), detail: this.detail };
  }
}
enumerable(PerformanceMark.prototype, ["detail"], "PerformanceMark");
export class PerformanceMeasure extends PerformanceEntry {
  #detail: unknown;
  constructor(token?: symbol, name = "", start = 0, duration = 0, detail: unknown = null) {
    if (token !== kSkipThrow) {
      illegal();
    }
    super(token, name, "measure", start, duration);
    brand(this, "PerformanceMeasure");
    this.#detail = detail;
  }
  get detail(): unknown {
    check(this, "PerformanceMeasure");
    return this.#detail;
  }
  override toJSON(): EntryJSON {
    check(this, "PerformanceMeasure");
    return { ...super.toJSON(), detail: this.detail };
  }
}
enumerable(PerformanceMeasure.prototype, ["detail"], "PerformanceMeasure");
export function mark(name: string, options?: MarkOptions): PerformanceMark {
  const entry = new PerformanceMark(name, options);
  enqueue(entry);
  bufferEntry(entry);
  return entry;
}
export function measure(
  name: string,
  options?: string | MeasureOptions,
  endMark?: string,
): PerformanceMeasure {
  if (typeof name !== "string") {
    invalid("name", "string", name);
  }
  let start: string | number | undefined;
  let end: string | number | undefined;
  let duration: number | undefined;
  if (options !== null && typeof options === "object") {
    ({ start, end, duration } = options);
  }
  const valid = start !== undefined || end !== undefined;
  if (
    valid &&
    (endMark !== undefined || (start !== undefined && end !== undefined && duration !== undefined))
  ) {
    throw coded(
      new TypeError(
        endMark !== undefined
          ? "endMark must not be specified"
          : "Must not have options.start, options.end, and options.duration specified",
      ),
      "ERR_PERFORMANCE_MEASURE_INVALID_OPTIONS",
    );
  }
  const finish =
    endMark !== undefined
      ? getMark(endMark)
      : valid && end !== undefined
        ? getMark(end)
        : valid && start !== undefined && duration !== undefined
          ? getMark(start) + getMark(duration)
          : now();
  const begin =
    typeof options === "string"
      ? getMark(options)
      : valid && start !== undefined
        ? getMark(start)
        : valid && duration !== undefined && end !== undefined
          ? finish - getMark(duration)
          : 0;
  const detail = clone(typeof options === "object" ? options?.detail : undefined);
  const entry = new PerformanceMeasure(kSkipThrow, name, begin, finish - begin, detail);
  enqueue(entry);
  bufferEntry(entry);
  return entry;
}
export function clearMarkTimings(name?: string): void {
  if (name !== undefined) {
    checkName(name);
    markTimings.delete(name);
  } else {
    markTimings.clear();
  }
}
