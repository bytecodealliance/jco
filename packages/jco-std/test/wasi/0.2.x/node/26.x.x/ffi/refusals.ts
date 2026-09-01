import { describe, expect, test } from "vitest";

import { createFfi } from "../../../../../../src/wasi/0.2.x/node/26.x.x/ffi/index.js";
import type { FfiHost } from "../../../../../../src/wasi/0.2.x/node/26.x.x/ffi/index.js";

const UNSUPPORTED = "ERR_JCO_UNSUPPORTED_NODE_API";

/**
 * A host that fails the test if it is called at all.
 *
 * These refusals must happen guest-side, before the boundary: the point is that Jco declines
 * rather than forwarding something the host would answer wrongly. Handing the module a host that
 * throws on contact is how that is asserted -- it is not a stand-in FFI implementation, and no
 * behaviour is simulated by it.
 */
function unreachableHost(): FfiHost {
  const fail = (name: string) => () => {
    throw new Error(`the host must not be reached, but ${name}() was called`);
  };
  return {
    open: fail("open"),
    close: fail("close"),
    symbol: fail("symbol"),
    define: fail("define"),
    call: fail("call"),
    read: fail("read"),
    write: fail("write"),
    readText: fail("readText"),
    readBytes: fail("readBytes"),
    writeBytes: fail("writeBytes"),
    writeText: fail("writeText"),
    currentEventLoop: fail("currentEventLoop"),
  } as unknown as FfiHost;
}

describe("what a component cannot express is refused before the host is reached", () => {
  test("getRawPointer: guest memory has no host address", () => {
    const ffi = createFfi(unreachableHost());
    expect(() => ffi.getRawPointer(new ArrayBuffer(8))).toThrowError(
      expect.objectContaining({ code: UNSUPPORTED }),
    );
  });

  test("toBuffer with copy: false asks for a live view", () => {
    const ffi = createFfi(unreachableHost());
    expect(() => ffi.toBuffer(1n, 4, false)).toThrowError(
      expect.objectContaining({ code: UNSUPPORTED }),
    );
  });

  test("toArrayBuffer with copy: false asks for a live view", () => {
    const ffi = createFfi(unreachableHost());
    expect(() => ffi.toArrayBuffer(1n, 4, false)).toThrowError(
      expect.objectContaining({ code: UNSUPPORTED }),
    );
  });

  test("a buffer-typed argument would be copied silently", () => {
    // Refused when the signature is declared, not when the call is made, so the message names the
    // offending type rather than surfacing later as a marshalling failure.
    const ffi = createFfi({
      ...unreachableHost(),
      open: () => 1,
    } as unknown as FfiHost);
    const lib = new ffi.DynamicLibrary("/nonexistent");
    expect(() => lib.getFunction("memcpy", { arguments: ["buffer"], return: "void" })).toThrowError(
      expect.objectContaining({ code: UNSUPPORTED }),
    );
  });

  test("an arraybuffer-typed argument is refused the same way", () => {
    const ffi = createFfi({ ...unreachableHost(), open: () => 1 } as unknown as FfiHost);
    const lib = new ffi.DynamicLibrary("/nonexistent");
    expect(() => lib.getFunction("f", { arguments: ["arraybuffer"], return: "void" })).toThrowError(
      expect.objectContaining({ code: UNSUPPORTED }),
    );
  });

  test("a function-typed argument needs a call back into the guest", () => {
    const ffi = createFfi({ ...unreachableHost(), open: () => 1 } as unknown as FfiHost);
    const lib = new ffi.DynamicLibrary("/nonexistent");
    expect(() =>
      lib.getFunction("qsort", { arguments: ["function"], return: "void" }),
    ).toThrowError(expect.objectContaining({ code: UNSUPPORTED }));
  });

  test("registerCallback and its companions are refused", () => {
    const ffi = createFfi({ ...unreachableHost(), open: () => 1 } as unknown as FfiHost);
    const lib = new ffi.DynamicLibrary("/nonexistent");
    for (const call of [
      () => lib.registerCallback({ arguments: [], return: "void" }, () => undefined),
      () => lib.unregisterCallback(1n),
      () => lib.refCallback(1n),
      () => lib.unrefCallback(1n),
    ]) {
      expect(call).toThrowError(expect.objectContaining({ code: UNSUPPORTED }));
    }
  });
});

describe("argument checking happens without the host", () => {
  test("a non-string path is rejected as Node rejects it", () => {
    const ffi = createFfi(unreachableHost());
    expect(() => new ffi.DynamicLibrary(42 as unknown as string)).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });

  test("a closed library refuses further use", () => {
    let closed = 0;
    const ffi = createFfi({
      ...unreachableHost(),
      open: () => 1,
      close: () => {
        closed += 1;
      },
    } as unknown as FfiHost);
    const lib = new ffi.DynamicLibrary("/nonexistent");
    lib.close();
    expect(closed).toBe(1);
    expect(() => lib.getSymbol("abs")).toThrowError(
      expect.objectContaining({ code: "ERR_FFI_LIBRARY_CLOSED" }),
    );
  });

  test("the wrong number of arguments is rejected before marshalling", () => {
    const ffi = createFfi({
      ...unreachableHost(),
      open: () => 1,
      define: () => undefined,
    } as unknown as FfiHost);
    const lib = new ffi.DynamicLibrary("/nonexistent");
    const abs = lib.getFunction("abs", { arguments: ["int32"], return: "int32" });
    expect(() => (abs as (...args: unknown[]) => unknown)(1, 2)).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
  });
});
