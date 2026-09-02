import { describe, expect, test } from "vitest";

import { createInspectorCore } from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector/index.js";
import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector-host.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector-host-node.js";

describe("node:inspector activation", () => {
  test("the deny host surfaces ERR_JCO_INSPECTOR_ADAPTER_REQUIRED", () => {
    const denied = createInspectorCore(denyHost);
    expect(() => denied.open()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_INSPECTOR_ADAPTER_REQUIRED" }),
    );
    expect(() => denied.url()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_INSPECTOR_ADAPTER_REQUIRED" }),
    );
    expect(() => denied.waitForDebugger()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_INSPECTOR_ADAPTER_REQUIRED" }),
    );
  });

  test("open returns a null-prototype Disposable holding only Symbol.dispose", () => {
    const core = createInspectorCore(nodeHost);
    let activation: { [Symbol.dispose](): void } | undefined;
    try {
      activation = core.open(0, "127.0.0.1", false);
    } catch (error) {
      // The runner may already have an inspector (e.g. launched with --inspect); accept that.
      expect((error as { code?: string }).code).toBe("ERR_INSPECTOR_ALREADY_ACTIVATED");
      return;
    }
    expect(Object.getPrototypeOf(activation)).toBeNull();
    expect(Object.getOwnPropertyNames(activation)).toEqual([]);
    expect(typeof activation[Symbol.dispose]).toBe("function");
    expect(typeof core.url()).toBe("string");
    activation[Symbol.dispose]();
    expect(core.url()).toBeUndefined();
  });

  test("waitForDebugger without an active inspector throws ERR_INSPECTOR_NOT_ACTIVE", () => {
    const core = createInspectorCore(nodeHost);
    if (core.url() !== undefined) {
      // An inspector is already active in this runner; the precondition does not hold.
      return;
    }
    expect(() => core.waitForDebugger()).toThrow(
      expect.objectContaining({ code: "ERR_INSPECTOR_NOT_ACTIVE" }),
    );
  });
});
