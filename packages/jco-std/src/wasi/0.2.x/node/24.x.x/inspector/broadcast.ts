/**
 * The experimental broadcast namespaces: `inspector.Network`, `inspector.DOMStorage`, and
 * `inspector.NetworkResources`.
 *
 * The `Network`/`DOMStorage` methods each take one `params` object and forward it to the host as a
 * CDP event through `emit(target, event, params-json)`. `NetworkResources.put(url, data)` registers
 * a resource the inspector can serve.
 *
 * Validation matches Node: `params` defaults to `{}` when omitted, but an explicit non-object
 * (including `null` and arrays) throws `ERR_INVALID_ARG_TYPE`.
 */

import { invalidArgType } from "./errors.js";
import type { HostBroadcastTarget, InspectorHost } from "./types.js";

const NETWORK_EVENTS = [
  "dataReceived",
  "dataSent",
  "loadingFailed",
  "loadingFinished",
  "requestWillBeSent",
  "responseReceived",
  "webSocketClosed",
  "webSocketCreated",
  "webSocketHandshakeResponseReceived",
] as const;

const DOM_STORAGE_EVENTS = [
  "domStorageItemAdded",
  "domStorageItemRemoved",
  "domStorageItemUpdated",
  "domStorageItemsCleared",
  "registerStorage",
] as const;

type BroadcastMethod = (params?: object) => void;
export type BroadcastNamespace = Record<string, BroadcastMethod>;
export interface NetworkResources {
  put(url: string, data: string): void;
}

/** Node's `params` default-and-validate: `undefined` -> `{}`, anything non-object-shaped throws. */
function normalizeParams(params: unknown): object {
  if (params === undefined) {
    return {};
  }
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw invalidArgType("params", "object", params);
  }
  return params;
}

function buildNamespace(
  host: InspectorHost,
  target: HostBroadcastTarget,
  events: readonly string[],
): BroadcastNamespace {
  const namespace: BroadcastNamespace = {};
  for (const event of events) {
    namespace[event] = (params?: object): void => {
      host.emit(target, event, JSON.stringify(normalizeParams(params)));
    };
  }
  return namespace;
}

export function createNetwork(host: InspectorHost): BroadcastNamespace {
  return buildNamespace(host, "network", NETWORK_EVENTS);
}

export function createDomStorage(host: InspectorHost): BroadcastNamespace {
  return buildNamespace(host, "dom-storage", DOM_STORAGE_EVENTS);
}

export function createNetworkResources(host: InspectorHost): NetworkResources {
  return {
    put(url: string, data: string): void {
      host.putNetworkResource(String(url), String(data));
    },
  };
}
