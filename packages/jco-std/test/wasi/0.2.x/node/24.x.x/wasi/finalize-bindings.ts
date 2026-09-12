import { WASI as NodeWASI } from "node:wasi";
import { describe, expect, test } from "vitest";
import {
  NESTED_INSTANTIATION_UNSUPPORTED,
  createWasi,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/core.js";
import { describeDifferential } from "../helpers/assert.js";
import { failureOf, fakeWasiHost } from "../helpers/wasi.js";

const UNSUPPORTED = {
  name: "Error",
  code: "ERR_JCO_UNSUPPORTED_NODE_API",
  message: `Running a WebAssembly module through node:wasi is not supported in a WebAssembly component: ${NESTED_INSTANTIATION_UNSUPPORTED}`,
};

const MEMORY_TYPE_ERROR = {
  name: "TypeError",
  code: "ERR_INVALID_ARG_TYPE",
  message: '"instance.exports.memory" property must be a WebAssembly.Memory object',
  typeError: true,
};

/** Run `fn` with no `WebAssembly` global, as the StarlingMonkey and QuickJS guests have none. */
function withoutWebAssembly<T>(fn: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebAssembly");
  Reflect.deleteProperty(globalThis, "WebAssembly");
  try {
    expect(typeof WebAssembly).toBe("undefined");
    return fn();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "WebAssembly", descriptor);
    }
  }
}

describe("wasi.finalizeBindings(instance[, options])", () => {
  test("validates the instance and its exports before anything else, as Node does", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    expect(failureOf(() => wasi.finalizeBindings(undefined as never))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: 'The "instance" argument must be of type object. Received undefined',
    });
    expect(failureOf(() => wasi.finalizeBindings(null as never))).toMatchObject({
      message: 'The "instance" argument must be of type object. Received null',
    });
    expect(failureOf(() => wasi.finalizeBindings([]))).toMatchObject({
      message: 'The "instance" argument must be of type object. Received an instance of Array',
    });
    expect(failureOf(() => wasi.finalizeBindings({}))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: 'The "instance.exports" property must be of type object. Received undefined',
    });
    expect(failureOf(() => wasi.finalizeBindings({ exports: null }))).toMatchObject({
      message: 'The "instance.exports" property must be of type object. Received null',
    });
    expect(failureOf(() => wasi.finalizeBindings({ exports: [] }))).toMatchObject({
      message:
        'The "instance.exports" property must be of type object. Received an instance of Array',
    });
  });

  test("rejects a memory that is not a WebAssembly.Memory the way Node's binding does", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    expect(failureOf(() => wasi.finalizeBindings({ exports: {} }))).toMatchObject(
      MEMORY_TYPE_ERROR,
    );
    expect(failureOf(() => wasi.finalizeBindings({ exports: { memory: {} } }))).toMatchObject(
      MEMORY_TYPE_ERROR,
    );
    expect(
      failureOf(() =>
        wasi.finalizeBindings(
          { exports: { memory: new WebAssembly.Memory({ initial: 1 }) } },
          { memory: 1 },
        ),
      ),
    ).toMatchObject(MEMORY_TYPE_ERROR);
  });

  test("refuses a real WebAssembly.Memory, since nothing in a component can bind it", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    const memory = new WebAssembly.Memory({ initial: 1 });
    expect(failureOf(() => wasi.finalizeBindings({ exports: { memory } }))).toMatchObject(
      UNSUPPORTED,
    );
    expect(failureOf(() => wasi.finalizeBindings({ exports: {} }, { memory }))).toMatchObject(
      UNSUPPORTED,
    );
  });

  test("refuses every memory value when the guest has no WebAssembly global", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    withoutWebAssembly(() => {
      expect(failureOf(() => wasi.finalizeBindings({ exports: {} }))).toMatchObject(UNSUPPORTED);
      expect(failureOf(() => wasi.finalizeBindings({ exports: { memory: {} } }))).toMatchObject(
        UNSUPPORTED,
      );
      // Object validation still comes first.
      expect(failureOf(() => wasi.finalizeBindings({}))?.code).toBe("ERR_INVALID_ARG_TYPE");
    });
  });

  test("names composition and the host as the alternatives", () => {
    expect(UNSUPPORTED.message).toContain("wac or wasm-tools compose");
    expect(UNSUPPORTED.message).toContain("run it on the host");
    expect(UNSUPPORTED.message).toContain("no WebAssembly global");
  });

  test("leaves the instance unstarted, so a retry reports the same failure", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    const memory = new WebAssembly.Memory({ initial: 1 });
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(failureOf(() => wasi.finalizeBindings({ exports: { memory } }))?.code).toBe(
        "ERR_JCO_UNSUPPORTED_NODE_API",
      );
    }
    expect(failureOf(() => wasi.wasiImport.fd_close(3))?.code).toBe("ERR_WASI_NOT_STARTED");
  });

  test("reads the memory default from the instance before validating it, as Node does", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    let reads = 0;
    const instance = {
      get exports() {
        reads++;
        return {};
      },
    };
    expect(failureOf(() => wasi.finalizeBindings(instance))?.code).toBe("ERR_INVALID_ARG_TYPE");
    // Once for the default parameter, once for validation.
    expect(reads).toBe(2);
    expect(failureOf(() => wasi.finalizeBindings({ exports: {} }, null as never))).toMatchObject({
      name: "TypeError",
      code: undefined,
    });
  });
});

describeDifferential("wasi.finalizeBindings() against Node", () => {
  test("validates the instance shape exactly as Node does", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    for (const instance of [
      undefined,
      null,
      1,
      "x",
      [],
      () => {},
      {},
      { exports: null },
      { exports: [] },
      { exports: {} },
      { exports: { memory: {} } },
    ]) {
      const portable = failureOf(() =>
        new WASI({ version: "preview1" }).finalizeBindings(instance as never),
      );
      const native = failureOf(() =>
        new NodeWASI({ version: "preview1" }).finalizeBindings(instance as never),
      );
      expect(portable, String(instance)).toEqual(native);
      expect(portable).not.toBeNull();
    }
  });
});
