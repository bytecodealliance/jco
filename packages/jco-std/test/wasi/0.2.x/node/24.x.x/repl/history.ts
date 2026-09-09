// `setupHistory()`, in-memory history navigation, and reverse search over the terminal.
import { expect, test } from "vitest";
import { open, portable } from "../helpers/repl.js";

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

test.concurrent("setupHistory keeps in-memory history and calls back with the server", async () => {
  const session = open(portable, { terminal: true });
  const ready = new Promise<unknown>((resolve) =>
    session.repl.setupHistory("", (_e: unknown, r: unknown) => resolve(r)),
  );
  expect(await ready).toBe(session.repl);
  session.repl.write("1 + 1");
  session.repl.write(null, { name: "return" });
  session.repl.write("2 + 2");
  session.repl.write(null, { name: "return" });
  expect(session.repl.history).toEqual(["2 + 2", "1 + 1"]);
  session.repl.write(null, { name: "up" });
  expect(session.repl.line).toBe("2 + 2");
  session.repl.write(null, { name: "up" });
  expect(session.repl.line).toBe("1 + 1");
  await session.finish();
  expect(strip(session.output.text)).not.toContain("Could not open history file");
});

test.concurrent("a history file path reports Node's could-not-open message and continues", async () => {
  const session = open(portable, { terminal: true });
  let loaded: unknown = null;
  session.repl.setupHistory(
    { filePath: "/nowhere/.history", size: 2 },
    (_e: unknown, r: unknown) => {
      loaded = r;
    },
  );
  expect(loaded).toBe(session.repl);
  expect(session.output.text).toContain(
    "\nError: Could not open history file.\nREPL session history will not be persisted.\n",
  );
  for (const line of ["1", "2", "3"]) {
    session.repl.write(line);
    session.repl.write(null, { name: "return" });
  }
  expect(session.repl.history).toEqual(["3", "2"]);
  await session.finish();
});

test.concurrent("setupHistory accepts the legacy string form and validates options", () => {
  const session = open(portable, { terminal: true });
  session.repl.setupHistory("");
  expect(() => session.repl.setupHistory({ size: -1 })).toThrow(/out of range/);
  expect(() => session.repl.setupHistory({ size: "x" })).toThrow(/must be of type number/);
  session.repl.close();
});

test.concurrent("reverse search finds and accepts a history entry", async () => {
  const session = open(portable, { terminal: true });
  for (const line of ["var historyAlpha = 1", "var historyBeta = 2"]) {
    session.repl.write(line);
    session.repl.write(null, { name: "return" });
  }
  session.repl.write(null, { name: "r", ctrl: true });
  expect(strip(session.output.text)).toContain("bck-i-search: _");
  session.repl.write("Alpha", { name: "A" });
  expect(strip(session.output.text)).toContain("bck-i-search: Alpha_");
  session.repl.write(null, { name: "return" });
  expect(session.repl.line).toBe("");
  await session.finish();
  expect(strip(session.output.text)).toContain("var historyAlpha = 1");
});

test.concurrent("reverse search is cancelled by escape, restoring the line", () => {
  const session = open(portable, { terminal: true });
  session.repl.write("historyGamma");
  session.repl.write(null, { name: "return" });
  session.repl.write("partial");
  session.repl.write(null, { name: "r", ctrl: true });
  session.repl.write("Gam", { name: "G" });
  session.repl.write(null, { name: "escape" });
  expect(session.repl.line).toBe("partial");
  session.repl.close();
});
