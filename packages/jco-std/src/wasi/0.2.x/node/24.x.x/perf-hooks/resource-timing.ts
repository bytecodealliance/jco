/**
 * Adapted from Node.js lib/internal/perf/resource_timing.js at v24.20.0,
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
import { brand, check, coded, enumerable, illegal, kSkipThrow } from "./internal.js";
import { PerformanceEntry, type EntryJSON } from "./entries.js";
import { enqueue, bufferEntry } from "./observe.js";
export interface ConnectionTimingInfo {
  domainLookupStartTime?: number;
  domainLookupEndTime?: number;
  connectionStartTime?: number;
  connectionEndTime?: number;
  secureConnectionStartTime?: number;
  ALPNNegotiatedProtocol?: string;
}
export interface ResourceTimingInfo {
  startTime: number;
  endTime: number;
  finalServiceWorkerStartTime?: number;
  redirectStartTime?: number;
  redirectEndTime?: number;
  postRedirectStartTime?: number;
  finalConnectionTimingInfo?: ConnectionTimingInfo;
  finalNetworkRequestStartTime?: number;
  finalNetworkResponseStartTime?: number;
  encodedBodySize: number;
  decodedBodySize: number;
}
export class PerformanceResourceTiming extends PerformanceEntry {
  #timing: ResourceTimingInfo;
  #cache: string;
  #initiator: string;
  #delivery: string;
  #status: number;
  constructor(
    token?: symbol,
    name = "",
    timing?: ResourceTimingInfo,
    cache = "",
    initiator = "",
    status = 0,
    delivery = "",
  ) {
    if (token !== kSkipThrow || !timing) {
      illegal();
    }
    super(token, name, "resource");
    brand(this, "PerformanceResourceTiming");
    this.#timing = timing;
    this.#cache = cache;
    this.#initiator = initiator;
    this.#status = status;
    this.#delivery = delivery;
  }
  override get startTime(): number {
    check(this, "PerformanceResourceTiming");
    return this.#timing.startTime;
  }
  override get duration(): number {
    check(this, "PerformanceResourceTiming");
    return this.#timing.endTime - this.#timing.startTime;
  }
  get initiatorType(): string {
    check(this, "PerformanceResourceTiming");
    return this.#initiator;
  }
  get workerStart(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalServiceWorkerStartTime;
  }
  get redirectStart(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.redirectStartTime;
  }
  get redirectEnd(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.redirectEndTime;
  }
  get fetchStart(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.postRedirectStartTime;
  }
  get domainLookupStart(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalConnectionTimingInfo?.domainLookupStartTime;
  }
  get domainLookupEnd(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalConnectionTimingInfo?.domainLookupEndTime;
  }
  get connectStart(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalConnectionTimingInfo?.connectionStartTime;
  }
  get connectEnd(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalConnectionTimingInfo?.connectionEndTime;
  }
  get secureConnectionStart(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalConnectionTimingInfo?.secureConnectionStartTime;
  }
  get nextHopProtocol(): string | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalConnectionTimingInfo?.ALPNNegotiatedProtocol;
  }
  get requestStart(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalNetworkRequestStartTime;
  }
  get responseStart(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#timing.finalNetworkResponseStartTime;
  }
  get responseEnd(): number {
    check(this, "PerformanceResourceTiming");
    return this.#timing.endTime;
  }
  get encodedBodySize(): number {
    check(this, "PerformanceResourceTiming");
    return this.#timing.encodedBodySize;
  }
  get decodedBodySize(): number {
    check(this, "PerformanceResourceTiming");
    return this.#timing.decodedBodySize;
  }
  get transferSize(): number | undefined {
    check(this, "PerformanceResourceTiming");
    return this.#cache === "local" ? 0 : this.#timing.encodedBodySize + 300;
  }
  get deliveryType(): string {
    check(this, "PerformanceResourceTiming");
    return this.#delivery;
  }
  get responseStatus(): number {
    check(this, "PerformanceResourceTiming");
    return this.#status;
  }
  override toJSON(): EntryJSON & Record<string, unknown> {
    check(this, "PerformanceResourceTiming");
    return {
      ...super.toJSON(),
      startTime: this.startTime,
      duration: this.duration,
      initiatorType: this.initiatorType,
      workerStart: this.workerStart,
      redirectStart: this.redirectStart,
      redirectEnd: this.redirectEnd,
      fetchStart: this.fetchStart,
      domainLookupStart: this.domainLookupStart,
      domainLookupEnd: this.domainLookupEnd,
      connectStart: this.connectStart,
      connectEnd: this.connectEnd,
      secureConnectionStart: this.secureConnectionStart,
      nextHopProtocol: this.nextHopProtocol,
      requestStart: this.requestStart,
      responseStart: this.responseStart,
      responseEnd: this.responseEnd,
      encodedBodySize: this.encodedBodySize,
      decodedBodySize: this.decodedBodySize,
      transferSize: this.transferSize,
      deliveryType: this.deliveryType,
      responseStatus: this.responseStatus,
    };
  }
}
enumerable(
  PerformanceResourceTiming.prototype,
  [
    "initiatorType",
    "workerStart",
    "redirectStart",
    "redirectEnd",
    "fetchStart",
    "domainLookupStart",
    "domainLookupEnd",
    "connectStart",
    "connectEnd",
    "secureConnectionStart",
    "nextHopProtocol",
    "requestStart",
    "responseStart",
    "responseEnd",
    "encodedBodySize",
    "decodedBodySize",
    "transferSize",
    "deliveryType",
    "responseStatus",
    "toJSON",
  ],
  "PerformanceResourceTiming",
);
export function markResourceTiming(
  timing: ResourceTimingInfo,
  requestedUrl: string,
  initiatorType: string,
  _global: unknown,
  cacheMode: "" | "local",
  _bodyInfo: unknown,
  responseStatus: number,
  deliveryType = "",
): PerformanceResourceTiming {
  if (cacheMode !== "" && cacheMode !== "local") {
    throw coded(new Error("cache must be an empty string or 'local'"), "ERR_INTERNAL_ASSERTION");
  }
  const entry = new PerformanceResourceTiming(
    kSkipThrow,
    requestedUrl,
    timing,
    cacheMode,
    initiatorType,
    responseStatus,
    deliveryType,
  );
  // Buffer first: on engines without a scheduler a full buffer throws, and observers must not
  // see an entry the caller never received.
  bufferEntry(entry);
  enqueue(entry);
  return entry;
}
