// Terminal-mode behaviour: raw mode, prompts, multi-line continuation on a TTY, Ctrl+D, and
// SIGCONT redraw.
import { expect, test } from "vitest";
import { open, portable } from "../helpers/repl.js";

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

test.concurrent("a terminal session takes raw mode, echoes, and releases it on close", async () => {
  const session = open(portable, { terminal: true });
  expect(session.input.isRaw).toBe(true);
  session.repl.write("6 * 7");
  session.repl.write(null, { name: "return" });
  await session.finish();
  expect(session.input.isRaw).toBe(false);
  expect(strip(session.output.text)).toContain("> 6 * 7\r\n42\n> ");
});

test.concurrent("an incomplete line on a TTY continues in place instead of buffering", async () => {
  const session = open(portable, { terminal: true });
  session.repl.write("function terminalFn() {");
  session.repl.write(null, { name: "return" });
  session.repl.write("return 5 }");
  session.repl.write(null, { name: "return" });
  session.repl.write("terminalFn()");
  session.repl.write(null, { name: "return" });
  const text = strip(await session.finish());
  expect(text).toContain("> terminalFn()\r\n5\n> ");
  // Node records the first line before learning it is incomplete, then the whole command.
  expect([...session.repl.lines]).toEqual([
    "function terminalFn() {",
    "function terminalFn() {\rreturn 5 }",
    "terminalFn()",
  ]);
});

test.concurrent("Ctrl+D on an empty line closes; on a non-empty line deletes", async () => {
  const session = open(portable, { terminal: true });
  session.repl.write("ab");
  session.repl.write(null, { name: "left" });
  session.repl.write(null, { name: "d", ctrl: true });
  expect(session.repl.line).toBe("a");
  session.repl.write(null, { name: "u", ctrl: true });
  session.repl.write(null, { name: "d", ctrl: true });
  await session.settle();
  expect(session.repl.closed).toBe(true);
  expect(session.events).toContain("exit");
});

test.concurrent("SIGCONT redraws the prompt, or the editor banner in editor mode", async () => {
  const session = open(portable, { terminal: true });
  session.repl.output.text = "";
  (session.repl as unknown as { emit(event: string): boolean }).emit("SIGCONT");
  expect(strip(session.output.text)).toContain("> ");
  session.repl.write(".editor");
  session.repl.write(null, { name: "return" });
  session.repl.write("partial");
  session.repl.write(null, { name: "return" });
  session.output.text = "";
  (session.repl as unknown as { emit(event: string): boolean }).emit("SIGCONT");
  expect(strip(session.output.text)).toContain(
    "> .editor\n// Entering editor mode (Ctrl+D to finish, Ctrl+C to cancel)\npartial\n",
  );
  session.repl.close();
});

test.concurrent("displayPrompt shows the continuation prompt while a command is buffered", () => {
  const session = open(portable);
  session.output.text = "";
  session.repl.displayPrompt();
  expect(session.output.text).toBe("> ");
  session.input.run(["function terminalBuffered() {"]);
  session.output.text = "";
  session.repl.displayPrompt();
  expect(session.output.text).toBe("| ");
  session.repl.setPrompt("$ ");
  session.repl.clearBufferedCommand();
  session.output.text = "";
  session.repl.displayPrompt();
  expect(session.output.text).toBe("$ ");
  expect(session.repl.getPrompt()).toBe("$ ");
  session.repl.close();
});
