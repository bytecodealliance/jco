import type { V8Host } from "./v8/types.js";

export const cachedDataVersionTag: V8Host["cachedDataVersionTag"];

export const statistics: V8Host["statistics"];

export const getHeapSnapshot: V8Host["getHeapSnapshot"];

export const writeHeapSnapshot: V8Host["writeHeapSnapshot"];

export const setFlagsFromString: V8Host["setFlagsFromString"];

export const takeCoverage: V8Host["takeCoverage"];

export const stopCoverage: V8Host["stopCoverage"];

export const setHeapSnapshotNearHeapLimit: V8Host["setHeapSnapshotNearHeapLimit"];

export const openWriter: V8Host["openWriter"];

export const openReader: V8Host["openReader"];

export const startProfile: V8Host["startProfile"];

export const releaseWriter: V8Host["releaseWriter"];

export const releaseReader: V8Host["releaseReader"];

export const releaseProfile: V8Host["releaseProfile"];
