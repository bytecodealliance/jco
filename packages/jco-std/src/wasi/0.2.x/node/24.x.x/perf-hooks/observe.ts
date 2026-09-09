/**
 * Adapted from Node.js lib/internal/perf/observe.js at v24.20.0,
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
import { unsupported } from "./errors.js";
import { domException } from "./errors.js";
import { registerBrand, brandPrototype } from "./errors.js";

import { PerformanceEntry } from "./entries.js";
import { coded, enumerable, illegal, invalid, kSkipThrow, missing, object } from "./errors.js";
const supported: readonly string[] = Object.freeze(["function", "mark", "measure", "resource"]);
const noEntryTypes: readonly string[] = Object.freeze([]);
const observers = new Set<PerformanceObserver>();
const pending = new Set<PerformanceObserver>();
let queued = false;
let entries: PerformanceEntry[] = [];
let resourceLimit = 250;
let resourcePending = false;
let secondary: PerformanceEntry[] = [];
let dispatchBufferFull: () => void = () => {};
export function setDispatchBufferFull(fn: () => void): void {
  dispatchBufferFull = fn;
}
function schedule(): void {
  if (queued) {
    return;
  }
  queued = true;
  setTimeout(() => {
    queued = false;
    const dispatch = [...pending];
    pending.clear();
    for (const observer of dispatch) {
      observer[dispatchRecords]();
    }
  }, 0);
}
export function filterEntries(name?: string, type?: string): PerformanceEntry[] {
  // Node concatenates its mark, measure and resource buffers before the stable sort.
  return ["mark", "measure", "resource"]
    .flatMap((kind) => entries.filter((entry) => entry.entryType === kind))
    .filter(
      (entry) =>
        (name === undefined || entry.name === name) &&
        (type === undefined || entry.entryType === type),
    )
    .sort((a, b) => a.startTime - b.startTime);
}
export function clearEntries(type: string, name?: string): void {
  entries = entries.filter(
    (entry) => entry.entryType !== type || (name !== undefined && entry.name !== name),
  );
}
export function setResourceTimingBufferSize(size: number): void {
  resourceLimit = size;
}
export function bufferEntry(entry: PerformanceEntry): void {
  if (
    entry.entryType !== "resource" ||
    (!resourcePending && filterEntries(undefined, "resource").length < resourceLimit)
  ) {
    entries.push(entry);
    return;
  }
  if (typeof globalThis.setTimeout !== "function" || typeof globalThis.Event !== "function") {
    unsupported("resource timing buffer overflow (runtime events and scheduler required)");
  }
  secondary.push(entry);
  if (resourcePending) {
    return;
  }
  resourcePending = true;
  setTimeout(() => {
    try {
      while (secondary.length) {
        dispatchBufferFull();
        const count = Math.max(
          0,
          Math.min(resourceLimit - filterEntries(undefined, "resource").length, secondary.length),
        );
        if (!count) {
          secondary = [];
          break;
        }
        entries.push(...secondary.splice(0, count));
      }
    } finally {
      resourcePending = false;
    }
  }, 0);
}
export class PerformanceObserverEntryList {
  #entries: PerformanceEntry[];
  constructor(token?: symbol, entries: PerformanceEntry[] = []) {
    if (token !== kSkipThrow) {
      illegal();
    }
    registerBrand(this, "PerformanceObserverEntryList");
    this.#entries = entries.sort((a, b) => a.startTime - b.startTime);
  }
  getEntries(): PerformanceEntry[] {
    return this.#entries.slice();
  }
  getEntriesByType(type: string): PerformanceEntry[] {
    if (!arguments.length) {
      missing("type");
    }
    type = `${type}`;
    return this.#entries.filter((entry) => entry.entryType === type);
  }
  getEntriesByName(name: string, type?: string): PerformanceEntry[] {
    if (!arguments.length) {
      missing("name");
    }
    name = `${name}`;
    return this.#entries.filter(
      (entry) => entry.name === name && (type == null || entry.entryType === type),
    );
  }
}
enumerable(
  PerformanceObserverEntryList.prototype,
  ["getEntries", "getEntriesByName", "getEntriesByType"],
  "PerformanceObserverEntryList",
);
export interface ObserverOptions {
  entryTypes?: string[];
  type?: string;
  buffered?: boolean;
}
export type ObserverCallback = (
  list: PerformanceObserverEntryList,
  observer: PerformanceObserver,
) => void;
const buffer = Symbol("buffer");
const dispatchRecords = Symbol("dispatch");
export class PerformanceObserver {
  #buffer: PerformanceEntry[] = [];
  #types = new Set<string>();
  #mode: "single" | "multiple" | undefined;
  #callback: ObserverCallback;
  constructor(callback: ObserverCallback) {
    if (typeof callback !== "function") {
      invalid("callback", "function", callback);
    }
    registerBrand(this, "PerformanceObserver");
    this.#callback = callback;
  }
  static get supportedEntryTypes(): readonly string[] {
    return typeof globalThis.setTimeout === "function" ? supported : noEntryTypes;
  }
  observe(options: ObserverOptions = {}): void {
    if (typeof globalThis.setTimeout !== "function") {
      unsupported("PerformanceObserver.observe (runtime task scheduler required)");
    }
    object(options, "options");
    const { entryTypes, type, buffered } = { ...options };
    if (entryTypes === undefined && type === undefined) {
      missing("options.entryTypes or options.type");
    }
    if (entryTypes != null && type != null) {
      throw coded(
        new TypeError("options.entryTypes can not set with options.type together"),
        "ERR_INVALID_ARG_VALUE",
      );
    }
    if (
      (this.#mode === "single" && entryTypes !== undefined) ||
      (this.#mode === "multiple" && type !== undefined)
    ) {
      throw domException(
        "PerformanceObserver can not change observation mode",
        "InvalidModificationError",
      );
    }
    this.#mode ??= entryTypes !== undefined ? "multiple" : "single";
    if (this.#mode === "multiple") {
      if (!Array.isArray(entryTypes)) {
        invalid("options.entryTypes", "string[]", entryTypes);
      }
      this.#types.clear();
      for (const entryType of entryTypes) {
        if (supported.includes(entryType)) {
          this.#types.add(entryType);
        }
      }
    } else {
      if (typeof type !== "string" || !supported.includes(type)) {
        return;
      }
      this.#types.add(type);
      if (buffered) {
        this.#buffer.push(...filterEntries(undefined, type));
        pending.add(this);
        schedule();
      }
    }
    if (this.#types.size) {
      observers.add(this);
    } else {
      this.disconnect();
    }
  }
  disconnect(): void {
    observers.delete(this);
    pending.delete(this);
    this.#buffer = [];
    this.#types.clear();
    this.#mode = undefined;
  }
  takeRecords(): PerformanceEntry[] {
    const records = this.#buffer;
    this.#buffer = [];
    return records;
  }
  [buffer](entry: PerformanceEntry): void {
    if (!this.#types.has(entry.entryType)) {
      return;
    }
    this.#buffer.push(entry);
    pending.add(this);
    schedule();
  }
  [dispatchRecords](): void {
    this.#callback(new PerformanceObserverEntryList(kSkipThrow, this.takeRecords()), this);
  }
}
enumerable(
  PerformanceObserver.prototype,
  ["observe", "disconnect", "takeRecords"],
  "PerformanceObserver",
);
export function enqueue(entry: PerformanceEntry): void {
  for (const observer of observers) {
    observer[buffer](entry);
  }
}

brandPrototype(PerformanceObserverEntryList.prototype, "PerformanceObserverEntryList");
brandPrototype(PerformanceObserver.prototype, "PerformanceObserver");
