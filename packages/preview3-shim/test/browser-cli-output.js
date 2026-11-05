import { expect, test, vi } from "vitest";

import { createOutput } from "../dist/browser/cli/output.js";

// Exercise the browser adapter under Node without a browser process. The shim
// code and Preview 2 handlers are the actual browser implementations.
vi.mock("@bytecodealliance/preview2-shim/cli", async () => {
  return import(
    new URL("../browser/cli.js", import.meta.resolve("@bytecodealliance/preview2-shim/cli")).href
  );
});
const preview2 = await import("@bytecodealliance/preview2-shim/cli");

function isolatedOutput(name, handler, drain) {
  let cli = preview2.createCli();
  const { output, setHandler } = createOutput(
    () => (name === "stdout" ? cli.stdout.getStdout() : cli.stderr.getStderr()),
    (handler) => {
      cli = preview2.createCli({ [name]: handler });
    },
  );
  setHandler(handler, drain);
  return { output, setHandler };
}

function openReader() {
  const readingNext = Promise.withResolvers();
  const eof = Promise.withResolvers();
  let reads = 0;
  return {
    readingNext: readingNext.promise,
    read: vi.fn(() => {
      if (reads++ === 0) {
        return { value: new Uint8Array([65, 66]), done: false };
      }
      readingNext.resolve();
      return eof.promise;
    }),
    [Symbol.dispose]: vi.fn(() => eof.resolve({ done: true })),
  };
}

test.concurrent.each(["stdout", "stderr"])(
  "%s flush waits for a host acknowledgement without closing its reader",
  async (name) => {
    const acknowledged = Promise.withResolvers();
    const write = vi.fn();
    const flush = vi.fn();
    const drop = vi.fn();
    const reader = openReader();
    const { output } = isolatedOutput(name, { write, flush, drop }, () => acknowledged.promise);
    const writing = output.writeViaStream(reader);
    await reader.readingNext;
    expect(write).toHaveBeenCalledExactlyOnceWith(new Uint8Array([65, 66]));
    let flushed = false;
    const flushing = output._flush().then(() => (flushed = true));
    await Promise.resolve();
    expect(flushed).toBe(false);
    expect(reader[Symbol.dispose]).not.toHaveBeenCalled();
    acknowledged.resolve();
    await flushing;
    expect(reader[Symbol.dispose]).not.toHaveBeenCalled();
    await output._shutdown();
    expect(await writing).toEqual({ tag: "ok", val: undefined });
    expect(reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    await output._shutdown();
    expect(reader[Symbol.dispose]).toHaveBeenCalledTimes(1);
  },
);

test.concurrent.each(["stdout", "stderr"])(
  "%s shutdown waits for the sink without guest EOF",
  async (name) => {
    const acknowledged = Promise.withResolvers();
    const reader = openReader();
    const { output } = isolatedOutput(name, { write() {} }, () => acknowledged.promise);
    const writing = output.writeViaStream(reader);
    await reader.readingNext;
    let stopped = false;
    const stopping = output._shutdown().then(() => (stopped = true));
    expect(reader[Symbol.dispose]).toHaveBeenCalledExactlyOnceWith();
    await Promise.resolve();
    expect(stopped).toBe(false);
    acknowledged.resolve();
    await stopping;
    expect(await writing).toEqual({ tag: "ok", val: undefined });
  },
);

test.concurrent("a synchronous handler keeps its existing write and flush behavior", async () => {
  const calls = [];
  const handler = {
    write(bytes) {
      calls.push([...bytes]);
    },
    flush() {
      calls.push("flush");
    },
  };
  const { output, setHandler } = isolatedOutput("stdout", handler);
  expect(
    await output.writeViaStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(65);
          controller.close();
        },
      }),
    ),
  ).toEqual({ tag: "ok", val: undefined });
  expect(calls).toEqual([[65], "flush", "flush"]);
  await output._flush();
  expect(calls).toEqual([[65], "flush", "flush", "flush"]);
  // The pre-existing one-argument setter remains usable after a drain hook.
  setHandler(handler, () => {
    throw new Error("old drain hook");
  });
  setHandler(handler);
  await output._flush();
});

test.concurrent("write completion does not acquire a new asynchronous sink acknowledgement", async () => {
  const acknowledged = Promise.withResolvers();
  const { output } = isolatedOutput(
    "stdout",
    {
      write() {},
      blockingWriteAndFlush() {
        return acknowledged.promise;
      },
    },
    () => acknowledged.promise,
  );
  // Preview 2's existing synchronous callbacks retain their original semantics.
  expect(
    await output.writeViaStream(
      (async function* () {
        yield [65];
      })(),
    ),
  ).toEqual({ tag: "ok", val: undefined });
  let flushed = false;
  const flushing = output._flush().then(() => (flushed = true));
  await Promise.resolve();
  expect(flushed).toBe(false);
  acknowledged.resolve();
  await flushing;
});

test.concurrent("shutdown cancels an open Web ReadableStream and releases its lock", async () => {
  const waiting = Promise.withResolvers();
  const cancel = vi.fn();
  let reads = 0;
  const source = new ReadableStream(
    {
      pull(controller) {
        if (reads++ === 0) {
          controller.enqueue(65);
        } else {
          waiting.resolve();
        }
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  const write = vi.fn();
  const { output } = isolatedOutput("stdout", { write });
  const writing = output.writeViaStream(source);
  await waiting.promise;
  await output._shutdown();
  expect(await writing).toEqual({ tag: "ok", val: undefined });
  expect(write).toHaveBeenCalledExactlyOnceWith(new Uint8Array([65]));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(source.locked).toBe(false);
});

test.concurrent.each(["resolve", "reject"])(
  "shutdown interrupts an async iterator before its next read can %s",
  async (settle) => {
    const waiting = Promise.withResolvers();
    const next = Promise.withResolvers();
    async function* source() {
      yield [65];
      waiting.resolve();
      await next.promise;
    }
    const { output } = isolatedOutput("stdout", { write() {} });
    const writing = output.writeViaStream(source());
    try {
      await waiting.promise;
      await output._shutdown();
      expect(await writing).toEqual({ tag: "ok", val: undefined });
    } finally {
      if (settle === "reject") {
        next.reject(new Error("late source error"));
      } else {
        next.resolve();
      }
    }
  },
);

test.concurrent("shutdown preserves an in-flight read that completes during disposal", async () => {
  const reading = Promise.withResolvers();
  const bytes = Promise.withResolvers();
  const source = {
    read: vi.fn(() => {
      reading.resolve();
      return bytes.promise;
    }),
    [Symbol.dispose]() {
      queueMicrotask(() => bytes.resolve({ value: [65, 66], done: false }));
    },
  };
  const write = vi.fn();
  const { output } = isolatedOutput("stdout", { write });
  const writing = output.writeViaStream(source);
  await reading.promise;
  await output._shutdown();
  expect(await writing).toEqual({ tag: "ok", val: undefined });
  expect(write).toHaveBeenCalledExactlyOnceWith(new Uint8Array([65, 66]));
  expect(source.read).toHaveBeenCalledTimes(1);
});

test.concurrent("destination drain failures reject the lifecycle helper", async () => {
  const failure = new Error("destination failed");
  const { output } = isolatedOutput("stderr", { write() {} }, async () => {
    throw failure;
  });
  await expect(output._flush()).rejects.toBe(failure);
  await expect(output._shutdown()).rejects.toBe(failure);
});

test.concurrent.each([
  ["EPIPE", "pipe"],
  ["ERR_ENCODING_INVALID_ENCODED_DATA", "illegal-byte-sequence"],
  ["EAGAIN", "io"],
])("existing browser write error mapping is preserved for %s", async (code, expected) => {
  const source = openReader();
  const { output } = isolatedOutput("stdout", {
    write() {
      throw Object.assign(new Error(code), { code });
    },
  });
  expect(await output.writeViaStream(source)).toEqual({ tag: "err", val: expected });
  expect(source[Symbol.dispose]).toHaveBeenCalledTimes(1);
});

test.concurrent("large browser writes retain the existing bounded chunking and byte order", async () => {
  const bytes = Uint8Array.from({ length: 3 * 4096 + 7 }, (_, index) => index % 256);
  const written = [];
  const { output } = isolatedOutput("stdout", {
    write(chunk) {
      written.push([...chunk]);
    },
  });
  expect(
    await output.writeViaStream(
      (async function* () {
        yield bytes;
      })(),
    ),
  ).toEqual({ tag: "ok", val: undefined });
  expect(written.map((chunk) => chunk.length)).toEqual([4096, 4096, 4096, 7]);
  expect(written.flat()).toEqual([...bytes]);
});

test.concurrent("public browser CLI helpers keep stdout and stderr independent", async () => {
  const cli = await import("../dist/browser/cli.js");
  const out = openReader();
  const err = openReader();
  const outAck = Promise.withResolvers();
  const errAck = Promise.withResolvers();
  const drainOut = vi.fn(() => outAck.promise);
  const drainErr = vi.fn(() => errAck.promise);
  cli._setStdout({ write() {} }, drainOut);
  cli._setStderr({ write() {} }, drainErr);
  const writes = [cli.stdout.writeViaStream(out), cli.stderr.writeViaStream(err)];
  await Promise.all([out.readingNext, err.readingNext]);
  expect(() => cli.exit.exitWithCode(3)).toThrow();
  expect(out[Symbol.dispose]).not.toHaveBeenCalled();
  expect(err[Symbol.dispose]).not.toHaveBeenCalled();
  expect(drainOut).not.toHaveBeenCalled();
  expect(drainErr).not.toHaveBeenCalled();
  const stoppingOut = cli.stdout._shutdown();
  expect(err[Symbol.dispose]).not.toHaveBeenCalled();
  outAck.resolve();
  await stoppingOut;
  expect(err[Symbol.dispose]).not.toHaveBeenCalled();
  let stopped = false;
  const stopping = cli._shutdown().then(() => (stopped = true));
  await Promise.resolve();
  expect(stopped).toBe(false);
  errAck.resolve();
  await stopping;
  expect((await Promise.all(writes)).every((result) => result.tag === "ok")).toBe(true);
  await cli._flush();
});
