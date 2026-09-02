/**
 * Assembles the `node:inspector` surface over a host adapter.
 *
 * `createInspectorCore(host)` builds one core shared by both entry points: `node:inspector` and
 * `node:inspector/promises` expose the same module members by identity and differ only in their
 * `Session` class. The core also owns the callback registry the guest-exported callbacks interface
 * hands back to the host.
 *
 * Inspector activation state (whether `open` has run, whether a client is attached) lives host-side,
 * so `open`/`close`/`url`/`waitForDebugger` forward and let the host be the source of truth for
 * `ERR_INSPECTOR_ALREADY_ACTIVATED` and `ERR_INSPECTOR_NOT_ACTIVE`.
 */

import { createNetwork, createDomStorage, createNetworkResources } from "./broadcast.js";
import type { BroadcastNamespace, NetworkResources } from "./broadcast.js";
import { CallbackRegistry } from "./callbacks.js";
import { createConsole } from "./console.js";
import type { InspectorConsole } from "./console.js";
import { fromHostError } from "./errors.js";
import { createSessions } from "./session.js";
import type { PromisesSessionConstructor, SessionConstructor } from "./session.js";
import type { InspectorHost } from "./types.js";

/** The object `open()` returns: a null-prototype `Disposable` whose only own key is `Symbol.dispose`. */
export type InspectorActivation = { [Symbol.dispose](): void };

export interface InspectorCore {
  registry: CallbackRegistry;
  open(port?: number, host?: string, wait?: boolean): InspectorActivation;
  close(): void;
  url(): string | undefined;
  waitForDebugger(): void;
  console: InspectorConsole;
  Session: SessionConstructor;
  PromisesSession: PromisesSessionConstructor;
  Network: BroadcastNamespace;
  DOMStorage: BroadcastNamespace;
  NetworkResources: NetworkResources;
}

export function createInspectorCore(host: InspectorHost): InspectorCore {
  const registry = new CallbackRegistry();
  const { Session, PromisesSession } = createSessions(host, registry);

  function close(): void {
    try {
      host.close();
    } catch (error) {
      throw fromHostError(error);
    }
  }

  function open(port?: number, host_?: string, wait?: boolean): InspectorActivation {
    // The WIT boundary carries a u32 port; a non-integer port becomes "the default", which is what
    // a component can express of Node's looser coercion.
    const portValue =
      typeof port === "number" && Number.isInteger(port) && port >= 0 ? port : undefined;
    const hostValue = typeof host_ === "string" ? host_ : undefined;
    try {
      host.open(portValue, hostValue, wait === true);
    } catch (error) {
      throw fromHostError(error);
    }
    const activation = Object.create(null) as InspectorActivation;
    Object.defineProperty(activation, Symbol.dispose, {
      value: () => close(),
      enumerable: false,
    });
    return activation;
  }

  function url(): string | undefined {
    try {
      return host.url();
    } catch (error) {
      throw fromHostError(error);
    }
  }

  function waitForDebugger(): void {
    try {
      host.waitForDebugger();
    } catch (error) {
      throw fromHostError(error);
    }
  }

  return {
    registry,
    open,
    close,
    url,
    waitForDebugger,
    console: createConsole(host),
    Session,
    PromisesSession,
    Network: createNetwork(host),
    DOMStorage: createDomStorage(host),
    NetworkResources: createNetworkResources(host),
  };
}
