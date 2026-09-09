import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { createProcess, denied, errorOf } from "../helpers/process.js";
import type { Warning } from "../../../../../../src/wasi/0.2.x/node/24.x.x/process/types.js";
test("warning overloads serialize fields and deliver the guest error asynchronously", async () => {
  const warnings: Warning[] = [];
  const p = createProcess({
    ...denied,
    emitWarning: (value) => {
      warnings.push(value);
    },
  });
  const emitted: Error[] = [];
  p.on("warning", (error: Error) => emitted.push(error));
  p.emitWarning("warning text", { type: "CustomWarning", code: "JCO_TEST", detail: "detail" });
  expect(emitted).toEqual([]);
  await Promise.resolve();
  expect(emitted[0]).toMatchObject({
    name: "CustomWarning",
    message: "warning text",
    code: "JCO_TEST",
    detail: "detail",
  });
  expect(warnings[0]).toMatchObject({
    name: "CustomWarning",
    message: "warning text",
    code: "JCO_TEST",
    detail: "detail",
  });
  const error = new Error("original");
  p.emitWarning(error);
  await Promise.resolve();
  expect(emitted[1]).toBe(error);
  for (const args of [[1], ["test", 3], ["test", "Warning", 3]]) {
    expect(errorOf(() => Reflect.apply(p.emitWarning, null, args))).toEqual(
      errorOf(() => Reflect.apply(nativeProcess.emitWarning, null, args)),
    );
  }
});

test("deprecation suppression precedes validation and emits no guest warning", async () => {
  const warnings: Warning[] = [];
  const p = createProcess({
    ...denied,
    getState: () => ({
      title: "test",
      debugPort: 0,
      sourceMapsEnabled: false,
      noDeprecation: true,
    }),
    emitWarning: (value) => {
      warnings.push(value);
    },
  });
  const emitted: unknown[] = [];
  p.on("warning", (value) => emitted.push(value));
  Reflect.apply(p.emitWarning, null, [{}, "DeprecationWarning"]);
  p.emitWarning("suppressed", { type: "DeprecationWarning" });
  await Promise.resolve();
  expect(warnings).toEqual([]);
  expect(emitted).toEqual([]);
});
