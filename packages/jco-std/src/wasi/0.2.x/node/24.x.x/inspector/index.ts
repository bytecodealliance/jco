/**
 * The `node:inspector` implementation, independent of how the host adapter is supplied.
 *
 * The two entry points (`inspector.ts`, `inspector-promises.ts`) each import a host from the WIT
 * interface and build their surface from this core. Keeping the assembly here means the plugin can
 * point either entry at a fake host in tests without duplicating the wiring.
 */

export { createInspectorCore } from "./core.js";
export type { InspectorActivation, InspectorCore } from "./core.js";
export { createInspectorCallbacks, CallbackRegistry } from "./callbacks.js";
export type { InspectorCallbacks } from "./callbacks.js";
export type { InspectorConsole } from "./console.js";
export type { BroadcastNamespace, NetworkResources } from "./broadcast.js";
export type {
  PromisesSession,
  PromisesSessionConstructor,
  Session,
  SessionConstructor,
  InspectorNotification,
} from "./session.js";
export type {
  HostBroadcastTarget,
  HostConnectKind,
  HostError,
  HostFailure,
  InspectorHost,
} from "./types.js";
