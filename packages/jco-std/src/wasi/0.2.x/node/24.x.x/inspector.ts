/**
 * `node:inspector` entry point.
 *
 * Host-backed, like `node:child_process` and `node:ffi`: the inspector is V8/host machinery WASI
 * cannot express, so this imports the `jco:node/inspector@0.1.0` interface and builds the module
 * surface over it. One core is created here and shared with `node:inspector/promises` so both
 * expose the same module members by identity, differing only in their `Session` class.
 *
 * `inspectorCallbacks` is the guest-*exported* `jco:node/inspector-callbacks@0.1.0` interface, the
 * channel the host uses to call back into the component. Jco's two-pass bundling adds it to the
 * component's top-level exports; keeping it here means it shares the one callback registry the
 * sessions register into.
 */

import * as host from "jco:node/inspector@0.1.0";

import { createInspectorCallbacks, createInspectorCore } from "./inspector/index.js";
import type { InspectorCore } from "./inspector/index.js";

const core: InspectorCore = createInspectorCore(host);

export const open = core.open;
export const close = core.close;
export const url = core.url;
export const waitForDebugger = core.waitForDebugger;
export const console = core.console;
export const Session = core.Session;
export const Network = core.Network;
export const DOMStorage = core.DOMStorage;
export const NetworkResources = core.NetworkResources;

const inspector = {
  open,
  close,
  url,
  waitForDebugger,
  console,
  Session,
  Network,
  DOMStorage,
  NetworkResources,
};

export default inspector;

/**
 * The shared core, consumed only by `inspector-promises.ts` so the promises entry reuses this
 * instance (and its callback registry) rather than building a second one.
 */
export const __inspectorCore: InspectorCore = core;

/** The guest-exported callbacks interface. Bundled into the component's top-level exports by Jco. */
export const inspectorCallbacks = createInspectorCallbacks(core.registry);
