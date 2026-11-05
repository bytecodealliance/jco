import { suite, test, expect, vi } from "vitest";
import { Writable } from "node:stream";

import { executeNodeScript } from "../../../test/helpers/node.mjs";
import { StreamReader, stream } from "@bytecodealliance/preview3-shim/stream";

// A separate CLI module gives each test its own set of active transfers. The
// process proxy selects that test's destinations without changing global stdout.
const OUTPUT_CONTEXT = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  return new AsyncLocalStorage();
});
vi.mock("node:process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get(target, key) {
        return OUTPUT_CONTEXT.getStore()?.[key] ?? Reflect.get(target, key);
      },
    }),
  };
});

let MODULE_ID = 0;
/** Run against an isolated CLI instance and test-local output destinations. */
async function withOutput(name, writable, run) {
  const context = OUTPUT_CONTEXT.getStore();
  const cli =
    context?.cli ??
    (await import(
      new URL(`../dist/nodejs/cli.js?output-test=${MODULE_ID++}`, import.meta.url).href
    ));
  return OUTPUT_CONTEXT.run({ ...context, [name]: writable, cli }, () => run(cli));
}

/** Create a reader and sink whose EOF and write acknowledgement are controlled by the test. */
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
    /** Supply one byte chunk, then remain open until the test disposes the reader. */
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
    /** Acknowledge the destination's currently blocked write. */
    release() {
      const callback = finishWrite;
      finishWrite = undefined;
      callback?.();
    },
  };
}

const WATER_MARKS = [
  ["stdout", 1],
  ["stdout", 65536],
  ["stderr", 1],
  ["stderr", 65536],
];

suite("Preview 3 output lifecycle", () => {
  test.concurrent.each(WATER_MARKS)(
    "flush waits for %s callbacks (highWaterMark=%s) without closing the reader",
    async (name, highWaterMark) => {
      const pending = pendingOutput(highWaterMark);
      await withOutput(name, pending.writable, async (cli) => {
        let completed = false;
        const result = cli[name].writeViaStream(pending.reader).then((value) => {
          completed = true;
          return value;
        });
        expect(await pending.written).toBe("AB");
        let flushed = false;
        const flushing = cli[name]._flush().then(() => (flushed = true));
        await Promise.resolve();
        expect(flushed).toBe(false);
        expect(pending.reader[Symbol.dispose]).not.toHaveBeenCalled();
        pending.release();
        await flushing;
        expect(completed).toBe(false);
        expect(pending.reader[Symbol.dispose]).not.toHaveBeenCalled();
        await cli[name]._shutdown();
        expect(await result).toEqual({ tag: "ok", val: undefined });
        expect(pending.writable.writableEnded).toBe(false);
      });
    },
  );

  test.concurrent.each(WATER_MARKS)(
    "shutdown drains %s (highWaterMark=%s) without guest EOF",
    async (name, highWaterMark) => {
      const pending = pendingOutput(highWaterMark);
      await withOutput(name, pending.writable, async (cli) => {
        const result = cli[name].writeViaStream(pending.reader);
        await pending.written;
        let stopped = false;
        const stopping = cli[name]._shutdown().then(() => (stopped = true));
        expect(pending.reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        expect(stopped).toBe(false);
        pending.release();
        await stopping;
        await cli[name]._shutdown();
        expect(pending.reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
        expect(await result).toEqual({ tag: "ok", val: undefined });
        expect(pending.writable.writableEnded).toBe(false);
      });
    },
  );

  test.concurrent("stdout shutdown does not close or await stderr", async () => {
    const out = pendingOutput();
    const err = pendingOutput();
    await withOutput("stdout", out.writable, () =>
      withOutput("stderr", err.writable, async (cli) => {
        const outResult = cli.stdout.writeViaStream(out.reader);
        const errResult = cli.stderr.writeViaStream(err.reader);
        await Promise.all([out.written, err.written]);
        const stopping = cli.stdout._shutdown();
        expect(err.reader[Symbol.dispose]).not.toHaveBeenCalled();
        out.release();
        await stopping;
        expect(err.reader[Symbol.dispose]).not.toHaveBeenCalled();
        err.release();
        await cli.stderr._shutdown();
        expect((await outResult).tag).toBe("ok");
        expect((await errResult).tag).toBe("ok");
      }),
    );
  });

  test.concurrent.each(WATER_MARKS)(
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
      await withOutput(name, pending.writable, async (cli) => {
        const result = cli[name].writeViaStream(rx);
        try {
          await tx.write(new Uint8Array([65, 66]));
          expect(await pending.written).toBe("AB");
          await readingNext.promise;
          const stopping = cli[name]._shutdown();
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

  test.concurrent("combined shutdown waits for both destinations", async () => {
    const out = pendingOutput();
    const err = pendingOutput();
    await withOutput("stdout", out.writable, () =>
      withOutput("stderr", err.writable, async (cli) => {
        const writes = [
          cli.stdout.writeViaStream(out.reader),
          cli.stderr.writeViaStream(err.reader),
        ];
        await Promise.all([out.written, err.written]);
        let stopped = false;
        const stopping = cli._shutdown().then(() => (stopped = true));
        expect(out.reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
        expect(err.reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
        out.release();
        await cli.stdout._flush();
        expect(stopped).toBe(false);
        err.release();
        await stopping;
        expect((await Promise.all(writes)).every((result) => result.tag === "ok")).toBe(true);
        await cli._flush();
      }),
    );
  });

  test.concurrent("accepting stream bytes does not wait for a destination flush", async () => {
    const pending = pendingOutput();
    await withOutput("stdout", pending.writable, async (cli) => {
      const { tx, rx } = stream();
      const result = cli.stdout.writeViaStream(rx);
      const copied = tx.write(new Uint8Array([65, 66]));
      expect(await pending.written).toBe("AB");
      await copied;
      await tx.close();
      pending.release();
      expect(await result).toEqual({ tag: "ok", val: undefined });
      await cli.stdout._flush();
    });
  });

  test.concurrent.each([
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
    await withOutput("stdout", output, async (cli) => {
      const result = await cli.stdout.writeViaStream(new StreamReader([[65]]));
      expect(result).toEqual({ tag: "err", val: expected });
    });
  });
});

suite("Preview 3 exit", () => {
  test.concurrent.each([
    ["success", 'exit.exit({ tag: "ok" })', 0],
    ["failure", 'exit.exit({ tag: "err" })', 1],
    ["code", "exit.exitWithCode(3)", 3],
  ])("%s exit remains immediate", async (_name, invoke, expectedExitCode) => {
    await executeNodeScript(
      "--input-type=module",
      "-e",
      `
      import { exit } from ${JSON.stringify(new URL("../dist/nodejs/cli.js", import.meta.url).href)};
      ${invoke};
      throw new Error('exit returned without terminating');
    `,
      { expectedExitCode },
    );
  });

  test.concurrent("exit does not shut down or drain a pending output", async () => {
    const result = await executeNodeScript(
      "--input-type=module",
      "-e",
      `
      import { stdout, exit } from ${JSON.stringify(new URL("../dist/nodejs/cli.js", import.meta.url).href)};
      process.stdout.write = (_chunk, _encoding, _callback) => false;
      const WRITTEN = Promise.withResolvers();
      const READER = {
        read() {
          WRITTEN.resolve();
          return new Promise(() => {});
        },
        [Symbol.dispose]() {
          throw new Error('exit disposed a pending output reader');
        },
      };
      stdout.writeViaStream(READER);
      await WRITTEN.promise;
      stdout._shutdown = () => { throw new Error('exit invoked output shutdown'); };
      exit.exitWithCode(3);
    `,
      { expectedExitCode: 3 },
    );
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
