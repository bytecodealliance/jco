// `replServer.defineCommand()` and keyword dispatch.
// Adapted from Node v24.20.0 test/parallel/test-repl-definecommand.js.
import { expect, test } from "vitest";
import { hostIsTargetNode } from "../helpers/assert.js";
import { both, errorCode, native, open, portable } from "../helpers/repl.js";

const differential = test.skipIf(!hostIsTargetNode);

differential.concurrent(
  "object and function commands receive the rest of the line and this",
  async () => {
    const run = async (api: typeof portable) => {
      const session = open(api);
      const seen: unknown[] = [];
      session.repl.defineCommand("say1", {
        help: "help for say1",
        action(this: unknown, thing: string) {
          seen.push(["say1", thing, this === session.repl]);
          (this as { output: { write(s: string): void }; displayPrompt(): void }).output.write(
            `hello ${thing}\n`,
          );
          (this as { displayPrompt(): void }).displayPrompt();
        },
      });
      session.repl.defineCommand("say2", function (this: unknown, thing: string) {
        seen.push(["say2", thing]);
        (this as { output: { write(s: string): void }; displayPrompt(): void }).output.write(
          `hello ${thing}\n`,
        );
        (this as { displayPrompt(): void }).displayPrompt();
      });
      session.input.run([".say1 node developer", ".say2 node developer", ".say1", ".help"]);
      return { text: await session.finish(), seen };
    };
    const actual = await run(portable);
    const expected = await run(native);
    expect(actual.text).toBe(expected.text);
    expect(actual.seen).toEqual(expected.seen);
    expect(actual.seen).toEqual([
      ["say1", "node developer", true],
      ["say2", "node developer"],
      ["say1", "", true],
    ]);
    expect(actual.text).toContain("hello node developer\n> hello node developer\n> hello \n> ");
    expect(actual.text).toMatch(/\.say1 {4}help for say1\n\.say2\n/);
  },
);

differential.concurrent("keyword lines, unknown keywords and decimals match Node", async () => {
  const { actual, expected } = await both([".nope", ".5 + 1", "..", ".help"]);
  expect(actual).toBe(expected);
  expect(actual.startsWith("> Invalid REPL keyword\n> 1.5\n")).toBe(true);
});

test.concurrent("a command without an action function is rejected", () => {
  const session = open(portable);
  expect(errorCode(() => session.repl.defineCommand("bad", { action: 1 }))).toBe(
    "ERR_INVALID_ARG_TYPE",
  );
  expect(errorCode(() => session.repl.defineCommand("bad", {}))).toBe("ERR_INVALID_ARG_TYPE");
  expect(session.repl.commands.bad).toBeUndefined();
  session.repl.close();
});

test.concurrent("commands live on a null-prototype object", () => {
  const session = open(portable);
  expect(Object.getPrototypeOf(session.repl.commands)).toBeNull();
  expect(Object.keys(session.repl.commands).sort()).toEqual([
    "break",
    "clear",
    "exit",
    "help",
    "load",
    "save",
  ]);
  session.repl.close();
});
