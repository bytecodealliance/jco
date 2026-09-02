/**
 * `node:inspector/promises` entry point.
 *
 * Reuses the one core built by `./inspector.ts`, so every module member is shared by identity with
 * `node:inspector` (`promises.open === inspector.open`, and so on). Only `Session` differs: the
 * promises `Session` extends the callback `Session` and its `post` returns a `Promise`.
 */

import { __inspectorCore } from "./inspector.js";

export const open = __inspectorCore.open;
export const close = __inspectorCore.close;
export const url = __inspectorCore.url;
export const waitForDebugger = __inspectorCore.waitForDebugger;
export const console = __inspectorCore.console;
export const Session = __inspectorCore.PromisesSession;
export const Network = __inspectorCore.Network;
export const DOMStorage = __inspectorCore.DOMStorage;
export const NetworkResources = __inspectorCore.NetworkResources;

const promises = {
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

export default promises;
