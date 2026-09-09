/**
 * Adapted from Node.js lib/internal/perf/performance.js and lib/perf_hooks.js at v24.20.0,
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
import { brand, check, enumerable, illegal, missing, now, unsupported } from "./internal.js";
import { PerformanceEntry } from "./entries.js";
import {
  PerformanceMark,
  PerformanceMeasure,
  mark,
  measure,
  clearMarkTimings,
  type MarkOptions,
  type MeasureOptions,
} from "./usertiming.js";
import {
  PerformanceObserver,
  PerformanceObserverEntryList,
  filterEntries,
  clearEntries,
  setResourceTimingBufferSize,
  setDispatchBufferFull,
} from "./observe.js";
import { PerformanceResourceTiming, markResourceTiming } from "./resource-timing.js";
import { timerify } from "./timerify.js";
export {
  PerformanceEntry,
  PerformanceMark,
  PerformanceMeasure,
  PerformanceObserver,
  PerformanceObserverEntryList,
  PerformanceResourceTiming,
  timerify,
};
export type { MarkOptions, MeasureOptions } from "./usertiming.js";
export type { ObserverOptions, ObserverCallback } from "./observe.js";
export type { ResourceTimingInfo, ConnectionTimingInfo } from "./resource-timing.js";
export type { TimerifyOptions } from "./timerify.js";
export interface CreateHistogramOptions {
  lowest?: number | bigint;
  highest?: number | bigint;
  figures?: number;
}
export interface EventLoopMonitorOptions {
  resolution?: number;
}
export interface EventLoopUtilization {
  idle: number;
  active: number;
  utilization: number;
}
export function createHistogram(_options?: CreateHistogramOptions): never {
  return unsupported("createHistogram (native HDR histogram required)");
}
export function monitorEventLoopDelay(_options?: EventLoopMonitorOptions): never {
  return unsupported("monitorEventLoopDelay (runtime event-loop instrumentation required)");
}
export function eventLoopUtilization(
  _first?: EventLoopUtilization,
  _second?: EventLoopUtilization,
): never {
  return unsupported("eventLoopUtilization (runtime event-loop instrumentation required)");
}
const token = Symbol("Performance");
// QuickJS does not supply EventTarget. Importing perf_hooks must still allow
// user timing; event operations fail lazily if the engine has no Web event API.
class MissingEventTarget implements EventTarget {
  addEventListener(
    _type: string,
    _callback: EventListenerOrEventListenerObject | null,
    _options?: boolean | AddEventListenerOptions,
  ): never {
    return unsupported("performance.addEventListener (runtime EventTarget required)");
  }
  removeEventListener(
    _type: string,
    _callback: EventListenerOrEventListenerObject | null,
    _options?: boolean | EventListenerOptions,
  ): never {
    return unsupported("performance.removeEventListener (runtime EventTarget required)");
  }
  dispatchEvent(_event: Event): never {
    return unsupported("performance.dispatchEvent (runtime EventTarget required)");
  }
}
const RuntimeEventTarget = globalThis.EventTarget ?? MissingEventTarget;
export class Performance extends RuntimeEventTarget {
  constructor(key?: symbol) {
    if (key !== token) {
      illegal();
    }
    super();
    brand(this, "Performance");
  }
  clearMarks(name?: string): void {
    check(this, "Performance");
    if (name !== undefined) {
      name = `${name}`;
    }
    clearMarkTimings(name);
    clearEntries("mark", name);
  }
  clearMeasures(name?: string): void {
    check(this, "Performance");
    clearEntries("measure", name === undefined ? undefined : `${name}`);
  }
  clearResourceTimings(name?: string): void {
    check(this, "Performance");
    clearEntries("resource", name === undefined ? undefined : `${name}`);
  }
  getEntries(): PerformanceEntry[] {
    check(this, "Performance");
    return filterEntries();
  }
  getEntriesByName(name: string, type?: string): PerformanceEntry[] {
    check(this, "Performance");
    if (!arguments.length) {
      missing("name");
    }
    return filterEntries(`${name}`, type === undefined ? undefined : `${type}`);
  }
  getEntriesByType(type: string): PerformanceEntry[] {
    check(this, "Performance");
    if (!arguments.length) {
      missing("type");
    }
    return filterEntries(undefined, `${type}`);
  }
  mark(name: string, options?: MarkOptions): PerformanceMark {
    check(this, "Performance");
    if (!arguments.length) {
      missing("name");
    }
    return mark(name, options);
  }
  measure(name: string, options?: string | MeasureOptions, endMark?: string): PerformanceMeasure {
    check(this, "Performance");
    if (!arguments.length) {
      missing("name");
    }
    return measure(name, options, endMark);
  }
  now(): number {
    check(this, "Performance");
    return now();
  }
  get timeOrigin(): number {
    check(this, "Performance");
    if (typeof globalThis.performance?.timeOrigin !== "number") {
      unsupported("performance.timeOrigin (runtime clock required)");
    }
    return globalThis.performance.timeOrigin;
  }
  setResourceTimingBufferSize(maxSize: number): void {
    check(this, "Performance");
    if (!arguments.length) {
      missing("maxSize");
    }
    // WebIDL unsigned long conversion, including truncation and modulo 2^32.
    setResourceTimingBufferSize(+maxSize >>> 0);
  }
  get nodeTiming(): never {
    check(this, "Performance");
    return unsupported("performance.nodeTiming (Node process milestones required)");
  }
  toJSON(): never {
    check(this, "Performance");
    return unsupported("performance.toJSON (Node process telemetry required)");
  }
  get onresourcetimingbufferfull(): ((event: Event) => void) | null {
    check(this, "Performance");
    return this.#onfull;
  }
  set onresourcetimingbufferfull(callback: ((event: Event) => void) | null) {
    check(this, "Performance");
    if (this.#onfull) {
      this.removeEventListener("resourcetimingbufferfull", this.#onfull);
    }
    this.#onfull = typeof callback === "function" ? callback : null;
    if (this.#onfull) {
      this.addEventListener("resourcetimingbufferfull", this.#onfull);
    }
  }
  #onfull: ((event: Event) => void) | null = null;
  // Defined on the prototype below, matching Node's shared top-level aliases.
  declare eventLoopUtilization: typeof eventLoopUtilization;
  declare timerify: typeof timerify;
  declare markResourceTiming: typeof markResourceTiming;
}
Object.defineProperties(Performance.prototype, {
  eventLoopUtilization: { configurable: true, writable: true, value: eventLoopUtilization },
  timerify: { configurable: true, writable: true, value: timerify },
  markResourceTiming: { configurable: true, writable: true, value: markResourceTiming },
});
enumerable(
  Performance.prototype,
  [
    "clearMarks",
    "clearMeasures",
    "clearResourceTimings",
    "getEntries",
    "getEntriesByName",
    "getEntriesByType",
    "mark",
    "measure",
    "now",
    "timeOrigin",
    "toJSON",
    "setResourceTimingBufferSize",
    "onresourcetimingbufferfull",
  ],
  "Performance",
);
export const performance: Performance = new Performance(token);
setDispatchBufferFull(() => performance.dispatchEvent(new Event("resourcetimingbufferfull")));
const publicConstants = {
  NODE_PERFORMANCE_GC_MAJOR: 4,
  NODE_PERFORMANCE_GC_MINOR: 1,
  NODE_PERFORMANCE_GC_MINOR_MARK_SWEEP: 2,
  NODE_PERFORMANCE_GC_INCREMENTAL: 8,
  NODE_PERFORMANCE_GC_WEAKCB: 16,
  NODE_PERFORMANCE_GC_FLAGS_NO: 0,
  NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED: 2,
  NODE_PERFORMANCE_GC_FLAGS_FORCED: 4,
  NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING: 8,
  NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE: 16,
  NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY: 32,
  NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE: 64,
};
// Node exposes binding constants non-enumerably as well as documented GC constants.
const internalConstants: Readonly<Record<string, number>> = {
  NODE_PERFORMANCE_ENTRY_TYPE_GC: 0,
  NODE_PERFORMANCE_ENTRY_TYPE_HTTP: 1,
  NODE_PERFORMANCE_ENTRY_TYPE_HTTP2: 2,
  NODE_PERFORMANCE_ENTRY_TYPE_NET: 3,
  NODE_PERFORMANCE_ENTRY_TYPE_DNS: 4,
  NODE_PERFORMANCE_ENTRY_TYPE_QUIC: 5,
  NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN_TIMESTAMP: 0,
  NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN: 1,
  NODE_PERFORMANCE_MILESTONE_ENVIRONMENT: 2,
  NODE_PERFORMANCE_MILESTONE_NODE_START: 3,
  NODE_PERFORMANCE_MILESTONE_V8_START: 4,
  NODE_PERFORMANCE_MILESTONE_LOOP_START: 5,
  NODE_PERFORMANCE_MILESTONE_LOOP_EXIT: 6,
  NODE_PERFORMANCE_MILESTONE_BOOTSTRAP_COMPLETE: 7,
};
for (const [key, value] of Object.entries(internalConstants)) {
  Object.defineProperty(publicConstants, key, { value });
}
export const constants: Readonly<typeof publicConstants & Record<string, number>> =
  Object.freeze(publicConstants);
const perfHooks = {
  Performance,
  PerformanceEntry,
  PerformanceMark,
  PerformanceMeasure,
  PerformanceObserver,
  PerformanceObserverEntryList,
  PerformanceResourceTiming,
  monitorEventLoopDelay,
  eventLoopUtilization,
  timerify,
  createHistogram,
  performance,
  constants,
};
Object.defineProperty(perfHooks, "constants", {
  configurable: false,
  writable: false,
  enumerable: true,
  value: constants,
});
export default perfHooks;
