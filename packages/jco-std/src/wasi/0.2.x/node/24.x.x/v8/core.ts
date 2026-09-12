import { Buffer } from "node:buffer";
import { Readable } from "../stream/index.js";
import {
  validateBoolean,
  validateObject,
  validateOneOf,
  validateString,
  validateUint32,
} from "../internal/validation.js";
import { createSerialization } from "./serialization.js";
import { createProfiles } from "./profiles.js";
import {
  promiseHooks,
  startupSnapshot,
  queryObjects,
  isStringOneByteRepresentation,
} from "./unsupported.js";
import { call } from "./errors.js";
import type {
  V8Host,
  HeapSnapshotOptions,
  HeapInfo,
  HeapSpaceInfo,
  HeapCodeStatistics,
} from "./types.js";

/** Copy only native snapshot settings, preserving Node's validation before host access. */
function snapshotOptions(options: HeapSnapshotOptions = {}): HeapSnapshotOptions {
  validateObject(options, "options");

  const { exposeInternals = false, exposeNumericValues = false } = options;

  validateBoolean(exposeInternals, "options.exposeInternals");
  validateBoolean(exposeNumericValues, "options.exposeNumericValues");

  return { exposeInternals, exposeNumericValues };
}

/** Importing the module never inspects or modifies the host V8 isolate. */
export function createV8(host: V8Host) {
  const serialization = createSerialization(host);
  const profiles = createProfiles(host);

  function cachedDataVersionTag(): number {
    return call(() => host.cachedDataVersionTag()) >>> 0;
  }

  function getHeapStatistics(): HeapInfo {
    return JSON.parse(call(() => host.statistics("heap")));
  }

  function getHeapSpaceStatistics(): HeapSpaceInfo[] {
    return JSON.parse(call(() => host.statistics("spaces")));
  }

  function getHeapCodeStatistics(): HeapCodeStatistics {
    return JSON.parse(call(() => host.statistics("code")));
  }

  function getCppHeapStatistics(detailLevel: "brief" | "detailed" = "detailed"): object {
    validateOneOf(detailLevel, "type", ["brief", "detailed"]);

    return JSON.parse(
      call(() => host.statistics(detailLevel === "brief" ? "cpp-brief" : "cpp-detailed")),
    );
  }

  function getHeapSnapshot(options?: HeapSnapshotOptions): Readable {
    const settings = snapshotOptions(options);
    const data = call(() => host.getHeapSnapshot(settings));

    return Readable.from([Buffer.from(data)], { objectMode: false });
  }

  function writeHeapSnapshot(filename?: string, options?: HeapSnapshotOptions): string {
    if (filename !== undefined) {
      validateString(filename, "filename");
    }

    const settings = snapshotOptions(options);

    return call(() => host.writeHeapSnapshot(filename, settings));
  }

  function setFlagsFromString(flags: string): void {
    validateString(flags, "flags");
    call(() => host.setFlagsFromString(flags));
  }

  function takeCoverage(): void {
    call(() => host.takeCoverage());
  }

  function stopCoverage(): void {
    call(() => host.stopCoverage());
  }

  function setHeapSnapshotNearHeapLimit(limit: number): void {
    validateUint32(limit, "limit", true);
    call(() => host.setHeapSnapshotNearHeapLimit(limit));
  }

  return {
    cachedDataVersionTag,
    getHeapSnapshot,
    getHeapStatistics,
    getHeapSpaceStatistics,
    getHeapCodeStatistics,
    getCppHeapStatistics,
    setFlagsFromString,
    ...serialization,
    takeCoverage,
    stopCoverage,
    writeHeapSnapshot,
    promiseHooks,
    queryObjects,
    startupSnapshot,
    setHeapSnapshotNearHeapLimit,
    ...profiles,
    isStringOneByteRepresentation,
  };
}

export type V8Module = ReturnType<typeof createV8>;
