import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { getEventListeners } from "node:events";
import { test, expect } from "vitest";
import readline from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline.js";
import promises from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline-promises.js";

test.concurrent("simple promise question, prompt restoration and callback consumption", async () => {
  const input = new PassThrough(),
    output = new PassThrough();
  let text = "";
  output.on("data", (c) => (text += c));
  const rl = promises.createInterface({ input, output, prompt: "> " });
  const answer = rl.question("What do you think of Node.js? ");
  input.write("Useful!\n");
  expect(await answer).toBe("Useful!");
  expect(text).toBe("What do you think of Node.js? ");
  expect(rl.getPrompt()).toBe("> ");
  rl.close();
  await expect(rl.question("again?")).rejects.toMatchObject({ code: "ERR_USE_AFTER_CLOSE" });
});

test.concurrent("callback custom promisification", async () => {
  const input = new PassThrough();
  const rl = readline.createInterface(input);
  const answer = promisify(rl.question).call(rl, "hello?");
  input.write("yes\n");
  expect(await answer).toBe("yes");
  rl.close();
});

test.concurrent("aborted questions reject with cause and restore the old prompt", async () => {
  const input = new PassThrough();
  const rl = promises.createInterface(input);
  for (const alreadyAborted of [false, true]) {
    const controller = new AbortController();
    if (alreadyAborted) {
      controller.abort("stop");
    }
    const result = rl.question("ask?", { signal: controller.signal });
    const assertion = expect(result).rejects.toMatchObject({
      name: "AbortError",
      code: "ABORT_ERR",
      cause: "stop",
    });
    if (!alreadyAborted) {
      controller.abort("stop");
    }
    await assertion;
    expect(rl.getPrompt()).toBe("> ");
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  }
  const controller = new AbortController();
  const result = rl.question("next?", { signal: controller.signal });
  input.write("ok\n");
  expect(await result).toBe("ok");
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  rl.close();
});

test.concurrent("callback abort suppresses the callback and releases the line", () => {
  const input = new PassThrough();
  const rl = readline.createInterface(input);
  const controller = new AbortController();
  let called = false;
  const lines: string[] = [];
  rl.on("line", (line: string) => lines.push(line));
  rl.question("ask?", { signal: controller.signal }, () => (called = true));
  controller.abort();
  input.write("line\n");
  expect(called).toBe(false);
  expect(lines).toEqual(["line"]);
  rl.close();
});

test.concurrent("constructor signal closes asynchronously when already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const rl = readline.createInterface({ input: new PassThrough(), signal: controller.signal });
  expect(rl.closed).not.toBe(true);
  await new Promise<void>((resolve) => rl.on("close", resolve));
  expect(rl.closed).toBe(true);
});

test.concurrent("Ctrl+C and Ctrl+D reject pending terminal questions", async () => {
  for (const name of ["c", "d"]) {
    const rl = promises.createInterface({
      input: new PassThrough(),
      output: new PassThrough(),
      terminal: true,
    });
    const result = rl.question("ask?");
    const assertion = expect(result).rejects.toMatchObject({ code: "ABORT_ERR" });
    rl.write(null, { name, ctrl: true });
    await assertion;
    expect(rl.closed).toBe(true);
  }
});

test.concurrent("promise completers resume input and expand the common prefix", async () => {
  const input = new PassThrough();
  const rl = promises.createInterface({
    input,
    output: new PassThrough(),
    terminal: true,

    completer: async (line: string) => [["hello", "help"], line],
  });
  rl.write("he");
  const resumed = new Promise<void>((resolve) => rl.on("resume", resolve));
  rl.write(null, { name: "tab" });
  await resumed;
  expect(rl.line).toBe("hel");
  expect(input.isPaused()).toBe(false);
  rl.close();
});
