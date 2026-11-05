import { describe, test, expect, vi } from "vitest";
import process from "node:process";
import { Writable } from "node:stream";

import { stdout, stderr, _flush, _shutdown, exit } from "@bytecodealliance/preview3-shim/cli";
import { StreamReader, stream } from "@bytecodealliance/preview3-shim/stream";

async function withOutput(name, writable, run) {
  const descriptor = Object.getOwnPropertyDescriptor(process, name);
  Object.defineProperty(process, name, { value: writable, configurable: true });
  try {
    await run();
  } finally {
    Object.defineProperty(process, name, descriptor);
  }
}

function pendingOutput(highWaterMark = 1) {
  const written = Promise.withResolvers();
  const ended = Promise.withResolvers();
  let finishWrite;
  let reads = 0;
  const writable = new Writable({
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
    [Symbol.dispose]: vi.fn(() => ended.resolve({ done: true })),
  };
  return {
    writable,
    reader,
    written: written.promise,
    release() {
      const callback = finishWrite;
      finishWrite = undefined;
      callback?.();
    },
  };
}

const outputs = { stdout, stderr };
const waterMarks = [
  ["stdout", 1],
  ["stdout", 65536],
  ["stderr", 1],
  ["stderr", 65536],
];

describe("Preview 3 output lifecycle", () => {
  test.each(waterMarks)(
    "flush waits for %s callbacks (highWaterMark=%s) without closing the reader",
    async (name, highWaterMark) => {
      const pending = pendingOutput(highWaterMark);
      await withOutput(name, pending.writable, async () => {
        let completed = false;
        const result = outputs[name].writeViaStream(pending.reader).then((value) => {
          completed = true;
          return value;
        });
        expect(await pending.written).toBe("AB");
        let flushed = false;
        const flushing = outputs[name]._flush().then(() => (flushed = true));
        await Promise.resolve();
        expect(flushed).toBe(false);
        expect(pending.reader[Symbol.dispose]).not.toHaveBeenCalled();
        pending.release();
        await flushing;
        expect(completed).toBe(false);
        expect(pending.reader[Symbol.dispose]).not.toHaveBeenCalled();
        await outputs[name]._shutdown();
        expect(await result).toEqual({ tag: "ok", val: undefined });
        expect(pending.writable.writableEnded).toBe(false);
      });
    },
  );

  test.each(waterMarks)(
    "shutdown drains %s (highWaterMark=%s) without guest EOF",
    async (name, highWaterMark) => {
      const pending = pendingOutput(highWaterMark);
      await withOutput(name, pending.writable, async () => {
        const result = outputs[name].writeViaStream(pending.reader);
        await pending.written;
        let stopped = false;
        const stopping = outputs[name]._shutdown().then(() => (stopped = true));
        expect(pending.reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        expect(stopped).toBe(false);
        pending.release();
        await stopping;
        await outputs[name]._shutdown();
        expect(pending.reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
        expect(await result).toEqual({ tag: "ok", val: undefined });
        expect(pending.writable.writableEnded).toBe(false);
      });
    },
  );

  test("stdout shutdown does not close or await stderr", async () => {
    const out = pendingOutput();
    const err = pendingOutput();
    await withOutput("stdout", out.writable, () =>
      withOutput("stderr", err.writable, async () => {
        const outResult = stdout.writeViaStream(out.reader);
        const errResult = stderr.writeViaStream(err.reader);
        await Promise.all([out.written, err.written]);
        const stopping = stdout._shutdown();
        expect(err.reader[Symbol.dispose]).not.toHaveBeenCalled();
        out.release();
        await stopping;
        expect(err.reader[Symbol.dispose]).not.toHaveBeenCalled();
        err.release();
        await stderr._shutdown();
        expect((await outResult).tag).toBe("ok");
        expect((await errResult).tag).toBe("ok");
      }),
    );
  });

  test.each(waterMarks)(
    "shutdown interrupts a real %s reader (highWaterMark=%s) without producer EOF",
    async (name, highWaterMark) => {
      const pending = pendingOutput(highWaterMark);
      const { tx, rx } = stream();
      const readingNext = Promise.withResolvers();
      const read = rx.read.bind(rx);
      let reads = 0;
      vi.spyOn(rx, "read").mockImplementation(() => {
        if (++reads === 2) {
          readingNext.resolve();
        }
        return read();
      });
      await withOutput(name, pending.writable, async () => {
        const result = outputs[name].writeViaStream(rx);
        try {
          await tx.write(new Uint8Array([65, 66]));
          expect(await pending.written).toBe("AB");
          await readingNext.promise;
          const stopping = outputs[name]._shutdown();
          pending.release();
          await stopping;
          expect(await result).toEqual({ tag: "ok", val: undefined });
          expect(pending.writable.writableEnded).toBe(false);
        } finally {
          pending.release();
          await tx.close();
          await result;
        }
      });
    },
  );

  test("combined shutdown waits for both destinations", async () => {
    const out = pendingOutput();
    const err = pendingOutput();
    await withOutput("stdout", out.writable, () =>
      withOutput("stderr", err.writable, async () => {
        const writes = [stdout.writeViaStream(out.reader), stderr.writeViaStream(err.reader)];
        await Promise.all([out.written, err.written]);
        let stopped = false;
        const stopping = _shutdown().then(() => (stopped = true));
        expect(out.reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
        expect(err.reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
        out.release();
        await stdout._flush();
        expect(stopped).toBe(false);
        err.release();
        await stopping;
        expect((await Promise.all(writes)).every((result) => result.tag === "ok")).toBe(true);
        await _flush();
      }),
    );
  });

  test("accepting stream bytes does not wait for a destination flush", async () => {
    const pending = pendingOutput();
    await withOutput("stdout", pending.writable, async () => {
      const { tx, rx } = stream();
      const result = stdout.writeViaStream(rx);
      const copied = tx.write(new Uint8Array([65, 66]));
      expect(await pending.written).toBe("AB");
      await copied;
      await tx.close();
      pending.release();
      expect(await result).toEqual({ tag: "ok", val: undefined });
      await stdout._flush();
    });
  });

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

describe("Preview 3 exit", () => {
  test.each([
    ["success", () => exit.exit({ tag: "ok" }), 0],
    ["failure", () => exit.exit({ tag: "err" }), 1],
    ["code", () => exit.exitWithCode(3), 3],
  ])("%s exit remains immediate", (_name, invoke, code) => {
    const terminate = vi.spyOn(process, "exit").mockImplementation(() => undefined);
    try {
      expect(invoke).not.toThrow();
      expect(terminate).toHaveBeenCalledExactlyOnceWith(code);
    } finally {
      terminate.mockRestore();
    }
  });

  test("exit does not shut down or drain a pending output", async () => {
    const pending = pendingOutput();
    await withOutput("stdout", pending.writable, async () => {
      const result = stdout.writeViaStream(pending.reader);
      await pending.written;
      const terminate = vi.spyOn(process, "exit").mockImplementation(() => undefined);
      try {
        exit.exitWithCode(3);
        expect(terminate).toHaveBeenCalledExactlyOnceWith(3);
        expect(pending.reader[Symbol.dispose]).not.toHaveBeenCalled();
      } finally {
        terminate.mockRestore();
        pending.release();
        await stdout._shutdown();
        await result;
      }
    });
  });
});
