import { createRequire } from "node:module";

import { describe, expect, test } from "vitest";

import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/26.x.x/ffi-host-node.js";
import { createFfi } from "../../../../../../src/wasi/0.2.x/node/26.x.x/ffi/index.js";
import type { FfiHost } from "../../../../../../src/wasi/0.2.x/node/26.x.x/ffi/index.js";

/**
 * Whether this runtime can actually do FFI.
 *
 * `node:ffi` landed in Node 26.1.0 and still needs `--experimental-ffi`, so on the Node 24 that CI
 * runs there is nothing to pass through to. These tests exercise the real thing or nothing at all:
 * there is deliberately no in-memory stand-in, because a fake would agree with whatever the
 * implementation happened to do.
 *
 * Run them with:
 *
 * ```console
 * node --experimental-ffi ./node_modules/.bin/vitest run --config test/vitest.ts
 * ```
 */
function hostHasFfi(): boolean {
  try {
    createRequire(import.meta.url)("node:ffi");
    return true;
  } catch {
    return false;
  }
}

const available = hostHasFfi();
const ffi = createFfi(nodeHost as unknown as FfiHost);

describe.skipIf(!available)("node:ffi passes through to the host", () => {
  /**
   * Symbols are resolved from the host process image rather than a named library.
   *
   * Node links libc, so `abs`, `malloc`, `free` and `strlen` are all reachable without depending
   * on a path that differs per platform and distribution.
   */
  function processImage() {
    return new ffi.DynamicLibrary(null);
  }

  test("calls a native function and returns its result", () => {
    const lib = processImage();
    try {
      const abs = lib.getFunction("abs", { arguments: ["int32"], return: "int32" }) as (
        n: number,
      ) => number;
      expect(abs(-7)).toBe(7);
      expect(abs(7)).toBe(7);
    } finally {
      lib.close();
    }
  });

  test("resolves a symbol to a non-null address", () => {
    const lib = processImage();
    try {
      const address = lib.getSymbol("abs");
      expect(typeof address).toBe("bigint");
      expect(address).not.toBe(0n);
      expect(lib.getSymbols().abs).toBe(address);
    } finally {
      lib.close();
    }
  });

  test("round-trips a primitive through host memory", () => {
    const lib = processImage();
    try {
      const malloc = lib.getFunction("malloc", { arguments: ["uint64"], return: "pointer" }) as (
        n: bigint,
      ) => bigint;
      const free = lib.getFunction("free", { arguments: ["pointer"], return: "void" }) as (
        p: bigint,
      ) => void;
      const pointer = malloc(64n);
      expect(pointer).not.toBe(0n);
      ffi.setInt32(pointer, 0, 123456);
      expect(ffi.getInt32(pointer, 0)).toBe(123456);
      ffi.setFloat64(pointer, 8, 1.5);
      expect(ffi.getFloat64(pointer, 8)).toBe(1.5);
      free(pointer);
    } finally {
      lib.close();
    }
  });

  test("native code reads a string the guest wrote", () => {
    const lib = processImage();
    try {
      const malloc = lib.getFunction("malloc", { arguments: ["uint64"], return: "pointer" }) as (
        n: bigint,
      ) => bigint;
      const free = lib.getFunction("free", { arguments: ["pointer"], return: "void" }) as (
        p: bigint,
      ) => void;
      const strlen = lib.getFunction("strlen", { arguments: ["pointer"], return: "uint64" }) as (
        p: bigint,
      ) => bigint;

      const pointer = malloc(64n);
      ffi.exportString("hello ffi", pointer, 64);
      // The round trip that matters: written from the guest, measured by native code, read back.
      expect(strlen(pointer)).toBe(9n);
      expect(ffi.toString(pointer)).toBe("hello ffi");
      expect([...ffi.toBuffer(pointer, 5)]).toEqual([104, 101, 108, 108, 111]);
      free(pointer);
    } finally {
      lib.close();
    }
  });

  test("toArrayBuffer copies rather than viewing", () => {
    const lib = processImage();
    try {
      const malloc = lib.getFunction("malloc", { arguments: ["uint64"], return: "pointer" }) as (
        n: bigint,
      ) => bigint;
      const free = lib.getFunction("free", { arguments: ["pointer"], return: "void" }) as (
        p: bigint,
      ) => void;
      const pointer = malloc(16n);
      ffi.setInt32(pointer, 0, 111);
      const copy = ffi.toArrayBuffer(pointer, 4);
      ffi.setInt32(pointer, 0, 222);
      expect(new DataView(copy).getInt32(0, true)).toBe(111);
      free(pointer);
    } finally {
      lib.close();
    }
  });

  test("reports the event loop address", () => {
    expect(typeof ffi.getCurrentEventLoop()).toBe("bigint");
  });

  test("a missing symbol fails with Node's code", () => {
    const lib = processImage();
    try {
      expect(() =>
        lib.getFunction("definitely_not_a_real_symbol", { arguments: [], return: "void" }),
      ).toThrowError(expect.objectContaining({ code: expect.stringMatching(/^ERR_/) }));
    } finally {
      lib.close();
    }
  });

  test("a closed library reports Node's closed-library code", () => {
    const lib = processImage();
    lib.close();
    expect(() => lib.getSymbol("abs")).toThrowError(
      expect.objectContaining({ code: "ERR_FFI_LIBRARY_CLOSED" }),
    );
  });
});

describe("the host adapter's suffix is configurable", () => {
  // The guest cannot ask the host for this at module load (Wizer refuses imported calls during
  // initialization), so an application serving a guest that names `.dylib` or `.dll` files sets it
  // host-side instead.
  test("an explicit value overrides the runtime's own", () => {
    const original = available ? nodeHost.suffix() : undefined;
    try {
      nodeHost.setSuffix("dylib");
      expect(nodeHost.suffix()).toBe("dylib");
      nodeHost.setSuffix("dll");
      expect(nodeHost.suffix()).toBe("dll");
    } finally {
      if (original !== undefined) {
        nodeHost.setSuffix(original);
      }
    }
  });

  test.skipIf(!available)("defaults to the runtime's own suffix", () => {
    expect(["so", "dylib", "dll"]).toContain(nodeHost.suffix());
  });
});

describe.skipIf(available)("without host FFI", () => {
  test("reports that the host has no node:ffi, naming the version and flag", () => {
    let error: (Error & { code?: string }) | undefined;
    try {
      new ffi.DynamicLibrary(null);
    } catch (thrown) {
      error = thrown as Error & { code?: string };
    }
    expect(error?.code).toBe("ERR_JCO_UNSUPPORTED_NODE_API");
    expect(error?.message).toContain("26.1.0");
    expect(error?.message).toContain("--experimental-ffi");
  });
});
