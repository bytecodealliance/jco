import * as host from "jco:node/v8@0.1.0";
import { createV8 } from "./v8/core.js";

export type * from "./v8/types.js";

const v8 = createV8(host);

export default v8;

export const {
  cachedDataVersionTag,
  getHeapSnapshot,
  getHeapStatistics,
  getHeapSpaceStatistics,
  getHeapCodeStatistics,
  getCppHeapStatistics,
  setFlagsFromString,
  Serializer,
  Deserializer,
  DefaultSerializer,
  DefaultDeserializer,
  deserialize,
  takeCoverage,
  stopCoverage,
  serialize,
  writeHeapSnapshot,
  promiseHooks,
  queryObjects,
  startupSnapshot,
  setHeapSnapshotNearHeapLimit,
  GCProfiler,
  isStringOneByteRepresentation,
  startCpuProfile,
} = v8;

export type Serializer = InstanceType<typeof Serializer>;

export type Deserializer = InstanceType<typeof Deserializer>;

export type DefaultSerializer = InstanceType<typeof DefaultSerializer>;

export type DefaultDeserializer = InstanceType<typeof DefaultDeserializer>;

export type GCProfiler = InstanceType<typeof GCProfiler>;
