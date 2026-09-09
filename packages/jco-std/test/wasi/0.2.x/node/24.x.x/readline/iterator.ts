import { PassThrough } from "node:stream";
import { test, expect } from "vitest";
import { createInterface } from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline.js";

test.concurrent("async iteration preserves queued lines, flushes EOF and closes on break", async () => {
  const input = new PassThrough(),
    rl = createInterface(input);
  const iterator = rl[Symbol.asyncIterator]();
  expect(rl[Symbol.asyncIterator]()).toBe(iterator);
  input.end("one\ntwo\ntail");
  const lines: string[] = [];
  for await (const line of iterator) {
    lines.push(line);
  }
  expect(lines).toEqual(["one", "two", "tail"]);
  expect(rl.closed).toBe(true);
  expect(rl.listenerCount("line")).toBe(0);
  const other = createInterface(new PassThrough());
  const iter = other[Symbol.asyncIterator]();
  other.write("a\nb\n");
  for await (const line of iter) {
    expect(line).toBe("a");
    break;
  }
  expect(other.closed).toBe(true);
  expect(other.listenerCount("line")).toBe(0);
});
test.concurrent("iterator applies backpressure and resumes after the queue drains", async () => {
  const input = new PassThrough(),
    rl = createInterface(input),
    iter = rl[Symbol.asyncIterator]();
  input.write("line\n".repeat(1026));
  expect(input.isPaused()).toBe(true);
  for (let i = 0; i < 1026; i++) {
    expect((await iter.next()).value).toBe("line");
  }
  expect(input.isPaused()).toBe(false);
  await iter.return!();
});
