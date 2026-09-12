import { adapterRequiredMessage } from "./internal/deny-host.js";
import type { HostErrorBase } from "./internal/wit-types.js";
import type {
  V8Host,
  Writer as WriterContract,
  Reader as ReaderContract,
  Profile as ProfileContract,
} from "./v8/types.js";

function denied(): never {
  throw {
    name: "Error",
    message: adapterRequiredMessage("node:v8"),
    code: "ERR_JCO_V8_ADAPTER_REQUIRED",
  } satisfies HostErrorBase;
}

export const cachedDataVersionTag: V8Host["cachedDataVersionTag"] = denied;

export const statistics: V8Host["statistics"] = denied;

export const getHeapSnapshot: V8Host["getHeapSnapshot"] = denied;

export const writeHeapSnapshot: V8Host["writeHeapSnapshot"] = denied;

export const setFlagsFromString: V8Host["setFlagsFromString"] = denied;

export const takeCoverage: V8Host["takeCoverage"] = denied;

export const stopCoverage: V8Host["stopCoverage"] = denied;

export const setHeapSnapshotNearHeapLimit: V8Host["setHeapSnapshotNearHeapLimit"] = denied;

export const openWriter: V8Host["openWriter"] = denied;

export const openReader: V8Host["openReader"] = denied;

export const startProfile: V8Host["startProfile"] = denied;

export const releaseWriter: V8Host["releaseWriter"] = denied;

export const releaseReader: V8Host["releaseReader"] = denied;

export const releaseProfile: V8Host["releaseProfile"] = denied;

export default {
  cachedDataVersionTag,
  statistics,
  getHeapSnapshot,
  writeHeapSnapshot,
  setFlagsFromString,
  takeCoverage,
  stopCoverage,
  setHeapSnapshotNearHeapLimit,
  openWriter,
  openReader,
  startProfile,
  releaseWriter,
  releaseReader,
  releaseProfile,
};

export class Writer implements WriterContract {
  constructor() {
    denied();
  }

  writeHeader(): void {
    return denied();
  }

  writeValue(_graph: string): boolean {
    return denied();
  }

  releaseBuffer(): Uint8Array {
    return denied();
  }

  writeUint32(_value: number): void {
    return denied();
  }

  writeUint64(_hi: number, _lo: number): void {
    return denied();
  }

  writeDouble(_value: number): void {
    return denied();
  }

  writeRawBytes(_data: Uint8Array): void {
    return denied();
  }

  setTreatViewsAsHostObjects(_flag: boolean): void {
    return denied();
  }
}

export class Reader implements ReaderContract {
  constructor() {
    denied();
  }

  readHeader(): boolean {
    return denied();
  }

  readValue(): string {
    return denied();
  }

  getWireFormatVersion(): number {
    return denied();
  }

  readUint32(): number {
    return denied();
  }

  readUint64(): [number, number] {
    return denied();
  }

  readDouble(): number {
    return denied();
  }

  readRawBytes(_length: number): Uint8Array {
    return denied();
  }
}

export class Profile implements ProfileContract {
  constructor() {
    denied();
  }

  stop(): string | undefined {
    return denied();
  }
}
