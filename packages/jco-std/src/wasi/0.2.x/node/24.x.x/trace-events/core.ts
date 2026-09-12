/**
 * Adapted from Node.js lib/trace_events.js at v24.20.0,
 * commit 71b8b174857e25106d39b61a9e6f30d927da8b01.
 * TypeScript adaptation: ECMAScript builtins replace primordials; shared errors and
 * inspection replace internal utilities; a lazy WIT host resource replaces CategorySet.
 * Host capture and warnings belong to the provider. Failed enable/disable calls leave
 * guest state unchanged. Captured events describe the host, not the guest engine.
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
import { codedError, invalidArgType } from "../errors/core.js";
import { validateObject } from "../internal/validation.js";
import { inspect } from "../internal/inspect.js";

import { hostCall } from "./errors.js";
import type {
  CreateTracingOptions,
  TraceEvents,
  TraceEventsHost,
  TraceSession,
  Tracing as TracingObject,
} from "./types.js";

/** Create one module instance with an explicitly supplied tracing capability. */
export function createTraceEvents(host: TraceEventsHost): TraceEvents {
  // Like Node, keep enabled objects alive even if application code drops its references.
  const enabledTracingObjects = new Set<Tracing>();

  // Adapted from Node's Tracing class; only the native handle boundary changes.
  class Tracing implements TracingObject {
    #handle: TraceSession | undefined;

    #categories: string[];

    #capturedCategories: string[] = [];

    constructor(categories: string[]) {
      this.#categories = categories;

      // CategorySet copies its input at construction, but the categories getter keeps
      // displaying the caller's original array, including later mutations and duplicates.
      for (let index = 0; index < categories.length; index++) {
        this.#capturedCategories.push(`${categories[index]}`);
      }
    }

    enable(): void {
      if (this.#handle !== undefined) {
        return;
      }

      // Commit state only after the provider succeeds, so a denied start remains disabled.
      this.#handle = hostCall(() => host.TraceSession.start(this.#capturedCategories));
      enabledTracingObjects.add(this);
    }

    disable(): void {
      if (this.#handle === undefined) {
        return;
      }

      const handle = this.#handle;

      hostCall(() => handle.stop());
      this.#handle = undefined;
      enabledTracingObjects.delete(this);

      // Transfer the stopped resource back to the host. This also releases the
      // guest handle on backends that do not expose Symbol.dispose.
      host.release(handle);
    }

    get enabled(): boolean {
      return this.#handle !== undefined;
    }

    get categories(): string {
      return Array.prototype.join.call(this.#categories, ",");
    }

    [Symbol.for("nodejs.util.inspect.custom")](depth: unknown, _options: unknown): string | this {
      if (typeof depth === "number" && depth < 0) {
        return this;
      }

      return `Tracing ${inspect({ enabled: this.enabled, categories: this.categories })}`;
    }
  }

  // Adapted from Node's createTracing and internal/validators.js validateStringArray.
  // Node 24 is strict here, despite the documentation describing string coercion.
  function createTracing(options: CreateTracingOptions): TracingObject {
    validateObject(options, "options");
    validateCategories(options.categories);

    if (options.categories.length === 0) {
      throw codedError(
        new TypeError("At least one category is required"),
        "ERR_TRACE_EVENTS_CATEGORY_REQUIRED",
      );
    }

    return new Tracing(options.categories);
  }

  function getEnabledCategories(): string | undefined {
    return hostCall(() => host.getEnabledCategories());
  }

  return { createTracing, getEnabledCategories };
}

function validateCategories(categories: unknown): asserts categories is string[] {
  if (!Array.isArray(categories)) {
    throw invalidArgType("options.categories", "Array", categories);
  }

  for (let index = 0; index < categories.length; index++) {
    if (typeof categories[index] !== "string") {
      throw invalidArgType(`options.categories[${index}]`, "string", categories[index]);
    }
  }
}
