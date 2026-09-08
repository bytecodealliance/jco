import { expect, test } from "vitest";

const original = {
  Controller: globalThis.AbortController,
  Signal: globalThis.AbortSignal,
  any: AbortSignal.any,
  abort: AbortSignal.abort,
  controllerAbort: AbortController.prototype.abort,
  throwIfAborted: AbortSignal.prototype.throwIfAborted,
};
const globals = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/abort-globals.js");

test("preserves conforming Node constructors and methods", () => {
  expect(globals.AbortController).toBe(original.Controller);
  expect(globals.AbortSignal).toBe(original.Signal);
  expect(AbortSignal.any).toBe(original.any);
  expect(AbortSignal.abort).toBe(original.abort);
  expect(AbortController.prototype.abort).toBe(original.controllerAbort);
  expect(AbortSignal.prototype.throwIfAborted).toBe(original.throwIfAborted);
  const controller = new globals.AbortController();
  const combined = globals.AbortSignal.any([controller.signal]);
  controller.abort();
  expect(combined.reason).toBe(controller.signal.reason);
});
