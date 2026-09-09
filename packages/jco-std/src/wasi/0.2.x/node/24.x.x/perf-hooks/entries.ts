/**
 * Adapted from Node.js lib/internal/perf/performance_entry.js at v24.20.0,
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
import { deprecatedNodeApi, illegalConstructor } from "../errors/core.js";

import { brand, check, enumerable, kSkipThrow } from "./internal.js";
export interface EntryJSON {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  detail?: unknown;
}
export class PerformanceEntry {
  #name: string;
  #type: string;
  #start: number;
  #duration: number;
  constructor(token?: symbol, name = "", type = "", start = 0, duration = 0) {
    if (token !== kSkipThrow) {
      throw illegalConstructor();
    }
    brand(this, "PerformanceEntry");
    this.#name = name;
    this.#type = type;
    this.#start = start;
    this.#duration = duration;
  }
  get name(): string {
    check(this, "PerformanceEntry");
    return this.#name;
  }
  get entryType(): string {
    check(this, "PerformanceEntry");
    return this.#type;
  }
  get startTime(): number {
    check(this, "PerformanceEntry");
    return this.#start;
  }
  get duration(): number {
    check(this, "PerformanceEntry");
    return this.#duration;
  }
  toJSON(): EntryJSON {
    check(this, "PerformanceEntry");
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
    };
  }
}
enumerable(PerformanceEntry.prototype, ["name", "entryType", "startTime", "duration", "toJSON"]);
export class PerformanceNodeEntry extends PerformanceEntry {
  #detail: unknown;
  constructor(
    token: symbol,
    name: string,
    type: string,
    start: number,
    duration: number,
    detail: unknown,
  ) {
    super(token, name, type, start, duration);
    brand(this, "PerformanceNodeEntry");
    this.#detail = detail;
  }
  get detail(): unknown {
    check(this, "PerformanceNodeEntry");
    return this.#detail;
  }
  get kind(): never {
    throw deprecatedNodeApi("PerformanceNodeEntry.kind", "detail.kind");
  }
  get flags(): never {
    throw deprecatedNodeApi("PerformanceNodeEntry.flags", "detail.flags");
  }
  set kind(_value: unknown) {
    throw deprecatedNodeApi("PerformanceNodeEntry.kind", "detail.kind");
  }
  set flags(_value: unknown) {
    throw deprecatedNodeApi("PerformanceNodeEntry.flags", "detail.flags");
  }
  override toJSON(): EntryJSON {
    check(this, "PerformanceNodeEntry");
    return { ...super.toJSON(), detail: this.detail };
  }
}
