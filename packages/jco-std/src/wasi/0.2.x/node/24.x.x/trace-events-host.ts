import { adapterRequiredMessage } from "./internal/deny-host.js";

import type { HostErrorBase } from "./internal/wit-types.js";
import type { TraceEventsHost } from "./trace-events/types.js";

/** The WIT result carries this record back to the guest as a catchable error. */
function denied(): never {
  throw {
    name: "Error",
    code: "ERR_JCO_TRACE_EVENTS_ADAPTER_REQUIRED",
    message: adapterRequiredMessage("node:trace_events"),
  } satisfies HostErrorBase;
}

/** Declaring the WIT import alone never grants access to host tracing. */
export class TraceSession {
  static start: TraceEventsHost["TraceSession"]["start"] = denied;
}

export const getEnabledCategories: TraceEventsHost["getEnabledCategories"] = denied;

export const release: TraceEventsHost["release"] = denied;

export default { TraceSession, getEnabledCategories, release };
