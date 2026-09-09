import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied, host } from "../helpers/process.js";

test("constructs lazily and never probes the build process", () => {
  const trap = new Proxy(host, {
    get() {
      throw new Error("eager host read");
    },
  });
  const p = createProcess(trap);
  expect(Object.prototype.toString.call(p)).toBe("[object process]");
  expect(p.memoryUsage).toBeTypeOf("function");
  expect(p.hrtime.bigint).toBeTypeOf("function");
  expect(p.report.getReport).toBeTypeOf("function");
});
test("denies host operations and properties with reconstructed errors", () => {
  const p = createProcess(denied);
  for (const read of [
    () => p.pid,
    () => p.cwd(),
    () => p.env.PATH,
    () => p.memoryUsage(),
    () => p.hrtime.bigint(),
    () => p.report.getReport(),
    () => p.exit(1),
  ]) {
    expect(read).toThrow(
      expect.objectContaining({ name: "Error", code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
    );
  }
});
test.skipIf(nativeProcess.versions.node.split(".")[0] !== "24")(
  "reports metadata against the pinned Node 24 oracle",
  () => {
    for (const name of [
      "arch",
      "platform",
      "pid",
      "ppid",
      "argv0",
      "execPath",
      "version",
    ] as const) {
      expect(process[name]).toBe(nativeProcess[name]);
    }
    expect(process.versions).toEqual(nativeProcess.versions);
    expect(process.release).toEqual(nativeProcess.release);
    expect(process.config).toEqual(nativeProcess.config);
    expect(process.argv).toEqual(nativeProcess.argv);
    expect(Array.isArray(process.argv)).toBe(true);
    expect(process.argv.length).toBe(nativeProcess.argv.length);
    expect(Object.getOwnPropertyDescriptor(process, "pid")).toMatchObject({
      enumerable: true,
      configurable: true,
      get: expect.any(Function),
    });
  },
);
