import type { InspectorHost } from "./inspector/types.js";

/**
 * The default adapter grants no inspector capability.
 *
 * The inspector exposes and drives the running isolate over a debugging protocol, so declaring the
 * WIT import must not, on its own, hand that power to a component. Applications opt in by mapping
 * `jco:node/inspector@0.1.0` to a host implementation such as `inspector-host-node.ts`.
 *
 * The refusal is thrown in the shape of the WIT `variant error` `denied` case, so the guest reports
 * it the same way it reports any other host failure -- as `ERR_JCO_INSPECTOR_ADAPTER_REQUIRED`.
 */
function denied(): never {
  throw {
    tag: "denied",
    val: "map jco:node/inspector@0.1.0 to a host adapter to grant it",
  };
}

export const open: InspectorHost["open"] = denied;
export const close: InspectorHost["close"] = denied;
export const url: InspectorHost["url"] = denied;
export const waitForDebugger: InspectorHost["waitForDebugger"] = denied;
export const consoleCall: InspectorHost["consoleCall"] = denied;
export const sessionConnect: InspectorHost["sessionConnect"] = denied;
export const sessionPost: InspectorHost["sessionPost"] = denied;
export const sessionDisconnect: InspectorHost["sessionDisconnect"] = denied;
export const emit: InspectorHost["emit"] = denied;
export const putNetworkResource: InspectorHost["putNetworkResource"] = denied;

export default {
  open,
  close,
  url,
  waitForDebugger,
  consoleCall,
  sessionConnect,
  sessionPost,
  sessionDisconnect,
  emit,
  putNetworkResource,
};
