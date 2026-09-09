// Differential cases require the pinned Node 24 major; portable fixtures run on every major.
import { emitKeypressEvents as native } from "node:readline";
import { PassThrough } from "node:stream";
import { test, expect } from "vitest";
import { emitKeypressEvents } from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline.js";

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("UTF-8 and ANSI key sequences split across chunks match Node", () => {
    const chunks = [
      Buffer.from("a🌍"),
      Buffer.from("\x1b["),
      Buffer.from("1;5D"),
      Buffer.from("\t\r\n\x7f\x03"),
      Buffer.from("\x1bOP"),
      Buffer.from("\x1bb"),
    ];
    function report(emit: typeof emitKeypressEvents | typeof native) {
      const stream = new PassThrough();
      const keys: unknown[] = [];
      emit(stream);
      emit(stream);
      stream.on("keypress", (text, key) => keys.push([text, key]));
      for (const chunk of chunks) {
        stream.write(chunk);
      }
      return keys;
    }
    expect(report(emitKeypressEvents)).toEqual(report(native));
  });
test.concurrent("standalone Escape uses the configured timeout", async () => {
  const stream = new PassThrough();
  emitKeypressEvents(stream, { escapeCodeTimeout: 5 });
  const event = new Promise((resolve) =>
    stream.on("keypress", (text, key) => resolve([text, key])),
  );
  stream.write("\x1b");
  expect(await event).toEqual([
    undefined,
    { sequence: "\x1b", name: "escape", ctrl: false, meta: true, shift: false },
  ]);
});
