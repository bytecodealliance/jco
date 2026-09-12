import * as node from "node:trace_events";

import { serializeHostError } from "./internal/host-error.js";

import type { TraceSession as Session, Tracing } from "./trace-events/types.js";

/** Serialize native failures as WIT results instead of trapping the component. */
function call<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw serializeHostError(error);
  }
}

/** Opt-in tracing of the Node host, including its CLI categories and trace-file writer. */
export class TraceSession implements Session {
  #tracing: Tracing;

  private constructor(tracing: Tracing) {
    this.#tracing = tracing;
  }

  static start(categories: string[]): TraceSession {
    return call(() => {
      const tracing = node.createTracing({ categories });

      try {
        tracing.enable();
      } catch (error) {
        // Node sets enabled before asking its native handle to start. Undo that on failure.
        tracing.disable();
        throw error;
      }

      return new TraceSession(tracing);
    });
  }

  stop(): void {
    call(() => this.#tracing.disable());
  }

  [Symbol.dispose](): void {
    this.#tracing.disable();
  }
}

export function getEnabledCategories(): string | undefined {
  return call(() => node.getEnabledCategories());
}

/** Consume the stopped resource returned by the guest, releasing its host state. */
export function release(session: TraceSession): void {
  session[Symbol.dispose]();
}

export default { TraceSession, getEnabledCategories, release };
