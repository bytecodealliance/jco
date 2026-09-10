// Differential cases require the pinned Node 24 major; portable fixtures run on every major.
// Streaming and terminal regressions adapted from Node v24.20.0 test/parallel/test-readline-interface.js.
import native from "node:readline";
import { PassThrough } from "node:stream";
import { test, expect } from "vitest";
import readline from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline.js";

test.concurrent("streaming UTF-8, CRLF across every byte boundary, Unicode separators and final line", async () => {
  const bytes = Buffer.from("hello 🌍\r\n\nnext\rlast\u2028para\u2029tail");
  for (let i = 0; i <= bytes.length; i++) {
    const input = new PassThrough();
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    const lines: string[] = [];
    rl.on("line", (line: string) => lines.push(line));
    const closed = new Promise<void>((resolve) => rl.on("close", resolve));
    input.write(bytes.subarray(0, i));
    input.end(bytes.subarray(i));
    await closed;
    expect(lines).toEqual(["hello 🌍", "", "next", "last", "para", "tail"]);
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("error")).toBe(0);
  }
});

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("pause, resume, prompts, question routing and input errors match Node", () => {
    function report(api: typeof readline | typeof native) {
      const input = new PassThrough(),
        output = new PassThrough();
      let text = "";
      output.on("data", (c) => (text += c));
      const options = { input, output, prompt: "ready> " };
      const rl =
        api === readline ? readline.createInterface(options) : native.createInterface(options);
      const events: unknown[] = [];
      for (const event of ["line", "pause", "resume", "close", "error"]) {
        rl.on(event, (...args: unknown[]) => events.push([event, ...args]));
      }
      rl.prompt();
      rl.pause();
      rl.pause();
      rl.resume();
      rl.resume();
      rl.question("ask? ", (answer) => events.push(["answer", answer]));
      rl.write("yes\nnext\n");
      input.emit("error", "failure");
      const prompt = rl.getPrompt();
      rl.close();
      return { text, events, prompt, line: rl.line };
    }

    expect(report(readline)).toEqual(report(native));
  });

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("terminal editing, history, undo, kill ring and cursor rendering match Node", () => {
    function report(api: typeof readline | typeof native) {
      const input = new PassThrough(),
        output = new PassThrough();
      let text = "";
      output.on("data", (c) => (text += c));
      const options = {
        input,
        output,
        terminal: true,
        historySize: 2,
        removeHistoryDuplicates: true,
      };
      const rl =
        api === readline ? readline.createInterface(options) : native.createInterface(options);
      const events: unknown[] = [];
      rl.on("line", (line: string) => events.push(["line", line]));
      rl.on("history", (history: string[]) => events.push(["history", [...history]]));

      const key = (name: string, ctrl = false, meta = false) =>
        rl.write(null, { name, ctrl, meta });

      rl.write("one");
      key("return");
      rl.write("two");
      key("return");
      rl.write("one");
      key("return");
      key("up");
      key("down");
      rl.write("ab🌍c");
      key("left");
      key("backspace");
      rl.write("XY");
      key("a", true);
      key("f", true);
      key("k", true);
      key("y", true);
      key("_", true);
      key("_", true, false);
      key("end");
      key("return");
      const state = { text, events, line: rl.line, cursor: rl.cursor, pos: rl.getCursorPos() };
      rl.close();
      return state;
    }

    expect(report(readline)).toEqual(report(native));
  });

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("options validation agrees with Node", () => {
    for (const options of [
      { historySize: -1 },
      { historySize: "bad" },
      { history: 1 },
      { completer: 4 },
      { tabSize: 0 },
      { escapeCodeTimeout: NaN },
      { signal: {} },
    ]) {
      const error = (api: typeof readline | typeof native) => {
        try {
          Reflect.apply(api.createInterface, api, [{ input: new PassThrough(), ...options }]);
          return null;
        } catch (e) {
          const err = e as Error & { code: string };
          return [err.name, err.code, err.message];
        }
      };

      expect(error(readline)).toEqual(error(native));
    }
  });

test.concurrent("raw mode, resize and signal ownership are released on close", () => {
  class RawInput extends PassThrough {
    isRaw = false;

    setRawMode(mode: boolean): this {
      this.isRaw = mode;
      return this;
    }
  }

  const input = new RawInput();
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 12 });
  const rl = readline.createInterface({ input, output });
  expect(input.isRaw).toBe(true);
  rl.write("abc");
  output.emit("resize");
  let signals = 0;
  rl.on("SIGINT", () => signals++);
  rl.write(null, { name: "c", ctrl: true });
  expect(signals).toBe(1);
  rl.on("SIGTSTP", () => signals++);
  rl.write(null, { name: "z", ctrl: true });
  expect(signals).toBe(2);
  rl.removeAllListeners("SIGTSTP");
  expect(() => rl.write(null, { name: "z", ctrl: true })).toThrow("cannot suspend");
  rl.close();
  expect(input.isRaw).toBe(false);
  expect(output.listenerCount("resize")).toBe(0);
  expect(input.listenerCount("keypress")).toBe(0);
});

test.concurrent("callback and synchronous completers expand common prefix", () => {
  for (const completer of [
    (line: string) => [["hello", "help"], line] as [string[], string],
    (line: string, cb: (error: null, result: [string[], string]) => void) =>
      cb(null, [["hello", "help"], line]),
  ]) {
    const rl = readline.createInterface({
      input: new PassThrough(),
      output: new PassThrough(),
      terminal: true,
      completer,
    });
    rl.write("he");
    rl.write(null, { name: "tab" });
    expect(rl.line).toBe("hel");
    rl.close();
  }
});

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("cursor positions include ANSI prompts, tabs, wide characters and wrapping", () => {
    for (const columns of [8, 16, 80]) {
      for (const line of ["abc", "中a", "e\u0301", "a\tb", "🌍hello"]) {
        const output = Object.assign(new PassThrough(), { columns });
        const options = {
          input: new PassThrough(),
          output,
          terminal: true,
          prompt: "\x1b[32mfirst\n> \x1b[0m",
        };
        const expected = native.createInterface(options);
        const actual = readline.createInterface({ ...options, input: new PassThrough() });
        expected.write(line);
        actual.write(line);
        expect(actual.getCursorPos()).toEqual(expected.getCursorPos());
        expected.close();
        actual.close();
      }
    }
  });

test.concurrent("opening and closing readline leaves caller-owned input usable", () => {
  const input = new PassThrough();
  const first = readline.createInterface(input);
  first.close();
  const second = readline.createInterface(input);
  const lines: string[] = [];
  second.on("line", (line: string) => lines.push(line));
  input.write("still open\n");
  expect(lines).toEqual(["still open"]);
  second.close();
});
