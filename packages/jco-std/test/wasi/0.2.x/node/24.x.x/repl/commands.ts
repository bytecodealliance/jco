// The built-in keyword commands: .break, .clear, .exit, .help, .save, .load and .editor.
import { expect, test } from "vitest";
import { hostIsTargetNode } from "../helpers/assert.js";
import { both, native, open, portable, transcript } from "../helpers/repl.js";

const differential = test.skipIf(!hostIsTargetNode);

differential.concurrent(".help lists the commands in Node's layout", async () => {
  const { actual, expected } = await both([".help"]);
  expect(actual).toBe(expected);
});

differential.concurrent(
  ".break and .clear discard buffered input; .clear is an alias in global mode",
  async () => {
    const { actual, expected } = await both([
      "function commandsBuffered() {",
      ".clear",
      "1",
      "[",
      ".break",
      "2",
    ]);
    expect(actual).toBe(expected);
    expect(actual).toBe("> | > 1\n> | > 2\n> ");
  },
);

differential.concurrent(".exit closes the session and emits exit", async () => {
  const run = async (api: typeof portable) => {
    const session = open(api);
    session.input.run(["1", ".exit", "2"]);
    await session.settle();
    return { text: session.text(), events: session.events, closed: session.repl.closed };
  };
  const actual = await run(portable);
  const expected = await run(native);
  expect(actual).toEqual(expected);
  expect(actual.closed).toBe(true);
  expect(actual.events).toEqual(["exit", "close"]);
  // close() is deferred, so a line already queued behind .exit still evaluates, as in Node.
  expect(actual.text).toBe("> 1\n> 2\n> ");
});

differential.concurrent(
  ".save and .load without a file name report the missing argument",
  async () => {
    const { actual, expected } = await both([".save", ".load"]);
    expect(actual).toBe(expected);
    expect(actual).toBe(
      '> The "file" argument must be specified\n> The "file" argument must be specified\n> ',
    );
  },
);

test.concurrent(".save and .load with a file name report Node's I/O failure text", async () => {
  const text = await transcript(portable, [
    ".save /nowhere/session.js",
    ".load /nowhere/session.js",
  ]);
  expect(text).toBe(
    "> Failed to save: /nowhere/session.js\n> Failed to load: /nowhere/session.js\n> ",
  );
});

test.concurrent(".editor exists only on terminals and evaluates the buffered text on Ctrl+D", async () => {
  const plain = open(portable);
  expect(plain.repl.commands.editor).toBeUndefined();
  plain.repl.close();

  const session = open(portable, { terminal: true });
  expect(session.repl.commands.editor).toBeDefined();
  session.repl.write(".editor");
  session.repl.write(null, { name: "return" });
  expect(session.repl.editorMode).toBe(true);
  session.repl.write("var commandsEditor = 6 *");
  session.repl.write(null, { name: "return" });
  session.repl.write("7; commandsEditor");
  session.repl.write(null, { name: "d", ctrl: true });
  expect(session.repl.editorMode).toBe(false);
  const text = await session.finish();
  const visible = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  expect(visible).toContain("// Entering editor mode (Ctrl+D to finish, Ctrl+C to cancel)");
  expect(visible).toContain("42");
});

test.concurrent("Ctrl+C in editor mode cancels and Ctrl+C twice on an empty line exits", async () => {
  const session = open(portable, { terminal: true });
  session.repl.write(".editor");
  session.repl.write(null, { name: "return" });
  session.repl.write("unfinished(");
  session.repl.write(null, { name: "c", ctrl: true });
  expect(session.repl.editorMode).toBe(false);
  expect(session.events.filter((event) => event === "SIGINT")).toHaveLength(1);
  session.repl.write(null, { name: "c", ctrl: true });
  session.repl.write(null, { name: "c", ctrl: true });
  await session.settle();
  const text = session.text().replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  expect(text).toContain("(To exit, press Ctrl+C again or Ctrl+D or type .exit)");
  expect(session.repl.closed).toBe(true);
  expect(session.events).toContain("exit");
});
