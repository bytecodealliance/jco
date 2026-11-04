import { describe, test, expect } from "vitest";
import process from "node:process";
import { Writable } from "node:stream";

import { stdout, stderr, _flush } from "@bytecodealliance/preview3-shim/cli";
import { StreamReader } from "@bytecodealliance/preview3-shim/stream";

async function withOutput(name, writable, run) {
  const descriptor = Object.getOwnPropertyDescriptor(process, name);
  Object.defineProperty(process, name, { value: writable, configurable: true });
  try {
    await run();
  } finally {
    Object.defineProperty(process, name, descriptor);
  }
}

describe("Preview 3 output completion", () => {
  test.each([
    ["stdout", 1],
    ["stdout", 65536],
    ["stderr", 1],
    ["stderr", 65536],
  ])(
    "flush waits for %s callbacks (highWaterMark=%s) without guest EOF",
    async (name, highWaterMark) => {
      const written = Promise.withResolvers();
      const ended = Promise.withResolvers();
      let finishWrite;
      let reads = 0;
      const output = new Writable({
        highWaterMark,
        write(chunk, _encoding, callback) {
          if (chunk.length === 0) {
            callback();
            return;
          }
          finishWrite = callback;
          written.resolve(Buffer.from(chunk).toString());
        },
      });
      const reader = {
        read() {
          if (reads++ === 0) {
            return Promise.resolve({ value: [65, 66], done: false });
          }
          return ended.promise;
        },
        [Symbol.dispose]() {
          ended.resolve({ done: true });
        },
      };
      await withOutput(name, output, async () => {
        const result = (name === "stdout" ? stdout : stderr).writeViaStream(reader);
        expect(await written.promise).toBe("AB");
        let flushed = false;
        const flushing = _flush().then(() => (flushed = true));
        await Promise.resolve();
        expect(flushed).toBe(false);
        finishWrite();
        await flushing;
        expect(await result).toEqual({ tag: "ok", val: undefined });
      });
    },
  );

  test.each([
    ["EPIPE", "pipe"],
    ["ERR_STREAM_PREMATURE_CLOSE", "pipe"],
    ["EAGAIN", "io"],
    ["ERR_ENCODING_INVALID_ENCODED_DATA", "illegal-byte-sequence"],
  ])("reports %s through the write result", async (code, expected) => {
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error(code), { code }));
      },
    });
    await withOutput("stdout", output, async () => {
      const result = await stdout.writeViaStream(new StreamReader([[65]]));
      expect(result).toEqual({ tag: "err", val: expected });
    });
  });
});
