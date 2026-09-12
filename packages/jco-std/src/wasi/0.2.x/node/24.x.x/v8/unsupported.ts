import { codedError } from "../errors/core.js";
import { unsupported } from "./errors.js";
import type {
  QueryConstructor,
  Init,
  Before,
  After,
  Settled,
  HookCallbacks,
  StartupSnapshotCallbackFn,
} from "./types.js";

export const promiseHooks = {
  createHook(_callbacks: HookCallbacks = {}): () => void {
    return unsupported("promiseHooks.createHook()");
  },

  onInit(_callback: Init): () => void {
    return unsupported("promiseHooks.onInit()");
  },

  onBefore(_callback: Before): () => void {
    return unsupported("promiseHooks.onBefore()");
  },

  onAfter(_callback: After): () => void {
    return unsupported("promiseHooks.onAfter()");
  },

  onSettled(_callback: Settled): () => void {
    return unsupported("promiseHooks.onSettled()");
  },
};

function notBuildingSnapshot(): never {
  throw codedError(
    new Error("Operation cannot be invoked when not building startup snapshot"),
    "ERR_NOT_BUILDING_SNAPSHOT",
  );
}

/** A component is never executing inside Node's startup-snapshot builder. */
export const startupSnapshot = {
  addDeserializeCallback(_callback: StartupSnapshotCallbackFn, _data?: unknown): void {
    notBuildingSnapshot();
  },

  addSerializeCallback(_callback: StartupSnapshotCallbackFn, _data?: unknown): void {
    notBuildingSnapshot();
  },

  setDeserializeMainFunction(_callback: StartupSnapshotCallbackFn, _data?: unknown): void {
    notBuildingSnapshot();
  },

  isBuildingSnapshot(): boolean {
    return false;
  },
};

export function queryObjects(_ctor: QueryConstructor): number | string[];
export function queryObjects(_ctor: QueryConstructor, _options: { format: "count" }): number;
export function queryObjects(_ctor: QueryConstructor, _options: { format: "summary" }): string[];
export function queryObjects(
  _ctor: QueryConstructor,
  _options?: { format: "count" | "summary" },
): number | string[] {
  return unsupported("queryObjects()");
}

export function isStringOneByteRepresentation(_content: string): boolean {
  return unsupported("isStringOneByteRepresentation()");
}
