import inspector from "node:inspector";

import { describe, expect, test } from "vitest";

import { createInspectorCore } from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector/index.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector-host-node.js";

const core = createInspectorCore(nodeHost);

describe("node:inspector.console", () => {
  test("matches Node's method set", () => {
    expect(Object.keys(core.console).sort()).toEqual(Object.keys(inspector.console).sort());
  });

  test("every method forwards and returns undefined", () => {
    for (const key of Object.keys(core.console)) {
      if (key === "context") {
        continue;
      }
      const method = (core.console as unknown as Record<string, (...a: unknown[]) => unknown>)[key];
      expect(method("value", 1, { nested: true })).toBeUndefined();
    }
  });

  test("context(name) returns a console with Node's context shape", () => {
    const context = core.console.context("app");
    // Node's context console has no nested context and spells the method dirXml (capital X).
    const nodeContextKeys = Object.keys(
      (inspector.console as unknown as { context(name: string): object }).context("app"),
    ).sort();
    expect(Object.keys(context).sort()).toEqual(nodeContextKeys);
    expect(Object.keys(context)).toContain("dirXml");
    expect(Object.keys(context)).not.toContain("dirxml");
    expect(Object.keys(context)).not.toContain("context");
  });

  test("a cyclic argument does not throw", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => core.console.log(cyclic)).not.toThrow();
  });
});
