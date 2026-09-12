import { WASI as NodeWASI } from "node:wasi";
import { describe, expect, test } from "vitest";
import { createWasi } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/core.js";
import { describeDifferential } from "../helpers/assert.js";
import { failureOf, fakeWasiHost } from "../helpers/wasi.js";

/** What a real instance looks like; the memory is what a component can never bind. */
function instance(exports: Record<string, unknown> = {}): { exports: Record<string, unknown> } {
  return { exports: { memory: new WebAssembly.Memory({ initial: 1 }), ...exports } };
}

describe("wasi.start(instance)", () => {
  test("validates the instance before refusing, with Node's errors", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    expect(failureOf(() => wasi.start(undefined as never))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: 'The "instance" argument must be of type object. Received undefined',
    });
    expect(failureOf(() => wasi.start({}))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: 'The "instance.exports" property must be of type object. Received undefined',
    });
    expect(failureOf(() => wasi.start({ exports: {} }))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: '"instance.exports.memory" property must be a WebAssembly.Memory object',
    });
  });

  test("refuses to run a module, before looking at _start", () => {
    const fake = fakeWasiHost();
    const { WASI } = createWasi(fake.host);
    const wasi = new WASI({ version: "preview1" });
    let ran = 0;
    const failure = failureOf(() =>
      wasi.start(
        instance({
          _start() {
            ran++;
          },
        }),
      ),
    );
    expect(failure).toMatchObject({ name: "Error", code: "ERR_JCO_UNSUPPORTED_NODE_API" });
    expect(failure?.message).toContain("wasi.start()");
    expect(ran).toBe(0);
    // A missing or wrong `_start` is never reached: the refusal comes first.
    expect(failureOf(() => wasi.start(instance()))?.code).toBe("ERR_JCO_UNSUPPORTED_NODE_API");
    expect(failureOf(() => wasi.start(instance({ _start: 1, _initialize() {} })))?.code).toBe(
      "ERR_JCO_UNSUPPORTED_NODE_API",
    );
    expect(fake.calls).toHaveLength(1);
  });

  test("can be retried: a refused start does not mark the instance started", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    expect(failureOf(() => wasi.start(instance()))?.code).toBe("ERR_JCO_UNSUPPORTED_NODE_API");
    expect(failureOf(() => wasi.start(instance()))?.code).toBe("ERR_JCO_UNSUPPORTED_NODE_API");
    expect(failureOf(() => wasi.initialize(instance()))?.code).toBe("ERR_JCO_UNSUPPORTED_NODE_API");
  });
});

describeDifferential("wasi.start() against Node", () => {
  test("rejects malformed instances exactly as Node does", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    for (const value of [undefined, null, [], {}, { exports: null }, { exports: {} }]) {
      expect(failureOf(() => new WASI({ version: "preview1" }).start(value as never))).toEqual(
        failureOf(() => new NodeWASI({ version: "preview1" }).start(value as never)),
      );
    }
  });

  test("diverges from Node only once a memory could be bound", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    expect(new NodeWASI({ version: "preview1" }).start(instance({ _start() {} }))).toBe(0);
    expect(
      failureOf(() => new WASI({ version: "preview1" }).start(instance({ _start() {} })))?.code,
    ).toBe("ERR_JCO_UNSUPPORTED_NODE_API");
  });
});
