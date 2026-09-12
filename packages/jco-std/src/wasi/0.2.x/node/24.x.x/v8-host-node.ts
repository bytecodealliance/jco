/** Explicit access to the host Node V8 isolate through public node:v8 APIs. */
import * as node from "node:v8";
import { Buffer } from "node:buffer";
import { nativeCall, Writer, Reader } from "./v8/host-serialization.js";
import type {
  StatisticsKind,
  HeapSnapshotOptions,
  Profile as ProfileContract,
} from "./v8/types.js";

export { Writer, Reader };

export function cachedDataVersionTag(): number {
  return nativeCall(() => node.cachedDataVersionTag());
}

export function statistics(kind: StatisticsKind): string {
  return nativeCall(() => {
    switch (kind) {
      case "heap":
        return JSON.stringify(node.getHeapStatistics());

      case "spaces":
        return JSON.stringify(node.getHeapSpaceStatistics());

      case "code":
        return JSON.stringify(node.getHeapCodeStatistics());

      case "cpp-brief":
        return JSON.stringify(node.getCppHeapStatistics("brief"));

      case "cpp-detailed":
        return JSON.stringify(node.getCppHeapStatistics("detailed"));
    }
  });
}

/** Node produces the native snapshot synchronously; bytes are copied across WIT. */
export function getHeapSnapshot(options: HeapSnapshotOptions): Uint8Array {
  return nativeCall(() => {
    const stream = node.getHeapSnapshot(options);
    const chunks: Uint8Array[] = [];

    try {
      for (let chunk: unknown = stream.read(); chunk !== null; chunk = stream.read()) {
        if (!(chunk instanceof Uint8Array)) {
          throw new TypeError("V8 snapshot stream returned a non-byte chunk");
        }

        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } finally {
      stream.destroy();
    }
  });
}

export function writeHeapSnapshot(
  filename: string | undefined,
  options: HeapSnapshotOptions,
): string {
  return nativeCall(() => node.writeHeapSnapshot(filename, options));
}

export function setFlagsFromString(flags: string): void {
  nativeCall(() => node.setFlagsFromString(flags));
}

export function takeCoverage(): void {
  nativeCall(() => node.takeCoverage());
}

export function stopCoverage(): void {
  nativeCall(() => node.stopCoverage());
}

export function setHeapSnapshotNearHeapLimit(limit: number): void {
  nativeCall(() => node.setHeapSnapshotNearHeapLimit(limit));
}

export function openWriter(defaults: boolean): Writer {
  return nativeCall(() => new Writer(defaults));
}

export function openReader(data: Uint8Array, defaults: boolean): Reader {
  return nativeCall(() => new Reader(data, defaults));
}

export class Profile implements ProfileContract {
  #profile: node.GCProfiler | node.SyncCPUProfileHandle | undefined;

  constructor(cpu: boolean) {
    if (cpu) {
      this.#profile = node.startCpuProfile();
    } else {
      const profiler = new node.GCProfiler();

      profiler.start();
      this.#profile = profiler;
    }
  }

  stop(): string | undefined {
    return nativeCall(() => {
      const profile = this.#profile;

      this.#profile = undefined;

      const result: unknown = profile?.stop();

      return typeof result === "string" ? result : JSON.stringify(result);
    });
  }

  [Symbol.dispose](): void {
    this.stop();
  }
}

export function startProfile(cpu: boolean): Profile {
  return nativeCall(() => new Profile(cpu));
}

export function releaseWriter(writer: Writer): void {
  writer[Symbol.dispose]();
}

export function releaseReader(reader: Reader): void {
  reader[Symbol.dispose]();
}

export function releaseProfile(profile: Profile): void {
  profile[Symbol.dispose]();
}

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
