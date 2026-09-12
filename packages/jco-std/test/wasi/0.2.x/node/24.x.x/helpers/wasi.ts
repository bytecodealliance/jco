import type {
  WasiError,
  WasiHostOptions,
  WasiProvider,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/types.js";

/** Node's own `uvwasi_init` failure for a missing preopen, as a WIT record. */
export const MISSING_PREOPEN: WasiError = {
  name: "Error",
  message: "UVWASI_ENOENT, uvwasi_init",
  code: "UVWASI_ENOENT",
  errno: { tag: "number", val: 44n },
  syscall: "uvwasi_init",
};

export interface FakeWasiHost {
  host: WasiProvider;
  /** Every `init` call's options, in order. */
  calls: WasiHostOptions[];
}

/** A provider that records what it is asked to initialise and optionally refuses. */
export function fakeWasiHost(failure?: WasiError): FakeWasiHost {
  const calls: WasiHostOptions[] = [];
  const host: WasiProvider = {
    init(options) {
      calls.push(options);
      if (failure) {
        throw failure;
      }
    },
  };
  return { host, calls };
}

export interface Failure {
  name: string;
  code: unknown;
  message: string;
  errno: unknown;
  syscall: unknown;
  /** Own enumerable keys, which for Node's uvwasi errors are `errno`, `code` and `syscall`. */
  keys: string[];
  typeError: boolean;
  rangeError: boolean;
}

/**
 * The public fields of whatever `run` throws, or `null` when it returns. Non-object throws (the
 * `kExitCode` symbol) are reported by their type name.
 */
export function failureOf(run: () => unknown): Failure | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (typeof error !== "object" || error === null) {
      return {
        name: typeof error,
        code: undefined,
        message: String(error),
        errno: undefined,
        syscall: undefined,
        keys: [],
        typeError: false,
        rangeError: false,
      };
    }
    const record = error as Record<string, unknown>;
    return {
      name: error instanceof Error ? error.name : Object.prototype.toString.call(error),
      code: record.code,
      message: String(record.message),
      errno: record.errno,
      syscall: record.syscall,
      keys: Object.keys(error),
      typeError: error instanceof TypeError,
      rangeError: error instanceof RangeError,
    };
  }
}
