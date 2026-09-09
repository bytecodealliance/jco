import { expect, test } from "vitest";
import { createProcess, denied } from "../helpers/process.js";
test("ordinary guest events have emitter identity and ordered once listeners", () => {
  const p = createProcess(denied),
    events: string[] = [];
  const listener = (x: string) => events.push(x);
  expect(p.on("custom", listener)).toBe(p);
  p.prependOnceListener("custom", () => events.push("first"));
  expect(p.emit("custom", "one")).toBe(true);
  p.emit("custom", "two");
  p.off("custom", listener);
  expect(events).toEqual(["first", "one", "two"]);
  expect(p.listenerCount("custom")).toBe(0);
});
test("host events reject registration before retaining the listener", () => {
  const p = createProcess(denied);
  for (const event of ["exit", "SIGTERM", "message", "unhandledRejection"]) {
    expect(() => p.on(event, () => {})).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(p.listenerCount(event)).toBe(0);
  }
  expect(() => p.once("multipleResolves", () => {})).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
  );
});

test("EventEmitter aliases retain identity", () => {
  const p = createProcess(denied);
  expect(p.on).toBe(p.addListener);
  expect(p.off).toBe(p.removeListener);
});
