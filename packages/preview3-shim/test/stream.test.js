import { describe, test, expect } from "vitest";

const { StreamReader, StreamWriter, stream, readableByteStreamFromReader } =
  await import("@bytecodealliance/preview3-shim/stream");

describe("Node.js Preview3 canon stream reader", () => {
  test("read() yields chunks and null at end", async () => {
    const rs = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new Uint8Array([1]));
        ctrl.enqueue(new Uint8Array([2]));
        ctrl.close();
      },
    });
    const reader = new StreamReader(rs);

    const first = await reader.read();
    expect(first).toBeInstanceOf(Uint8Array);
    expect(first[0]).toBe(1);

    const second = await reader.read();
    expect(second[0]).toBe(2);

    const done = await reader.read();
    expect(done).toBeNull();
  });

  test("read() works with a plain async iterable", async () => {
    async function* generate() {
      yield new Uint8Array([10]);
      yield new Uint8Array([20]);
    }
    const reader = new StreamReader(generate());

    const first = await reader.read();
    expect(first).toBeInstanceOf(Uint8Array);
    expect(first[0]).toBe(10);

    const second = await reader.read();
    expect(second[0]).toBe(20);

    const done = await reader.read();
    expect(done).toBeNull();
  });

  test("readAll() concatenates multiple chunks", async () => {
    const rs = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(Buffer.from("foo"));
        ctrl.enqueue(Buffer.from("bar"));
        ctrl.close();
      },
    });
    const reader = new StreamReader(rs);
    const all = await reader.readAll();
    expect(all.toString()).toBe("foobar");
  });

  test("readAll() works with a plain async iterable", async () => {
    async function* generate() {
      yield Buffer.from("hello");
      yield Buffer.from("world");
    }
    const reader = new StreamReader(generate());
    const all = await reader.readAll();
    expect(all.toString()).toBe("helloworld");
  });

  test("intoAsyncIterator() returns an async iterator", async () => {
    const rs = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(Buffer.from("abc"));
        ctrl.enqueue(Buffer.from("def"));
        ctrl.close();
      },
    });
    const reader = new StreamReader(rs);
    const iter = reader.intoAsyncIterator();

    const first = await iter.next();
    expect(first.done).toBe(false);
    expect(Buffer.from(first.value).toString()).toBe("abc");

    const second = await iter.next();
    expect(second.done).toBe(false);
    expect(Buffer.from(second.value).toString()).toBe("def");

    const third = await iter.next();
    expect(third.done).toBe(true);
  });

  test("intoAsyncIterator() works with a plain async iterable", async () => {
    async function* generate() {
      yield Buffer.from("hello");
      yield Buffer.from("world");
    }
    const reader = new StreamReader(generate());
    const iter = reader.intoAsyncIterator();

    const chunks = [];
    for await (const chunk of { [Symbol.asyncIterator]: () => iter }) {
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks).toString()).toBe("helloworld");
  });

  test("[Symbol.asyncIterator]() works in await loop", async () => {
    async function* generate() {
      yield Buffer.from("foo");
      yield Buffer.from("bar");
    }
    const reader = new StreamReader(generate());

    const chunks = [];
    for await (const chunk of reader) {
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks).toString()).toBe("foobar");
  });

  test("read() works with a sync iterable", async () => {
    const source = [new Uint8Array([1]), new Uint8Array([2])];
    const reader = new StreamReader(source);

    const first = await reader.read();
    expect(first).toBeInstanceOf(Uint8Array);
    expect(first[0]).toBe(1);

    const second = await reader.read();
    expect(second[0]).toBe(2);

    const done = await reader.read();
    expect(done).toBeNull();
  });

  test("readAll() works with a sync iterable", async () => {
    const source = [Buffer.from("sync"), Buffer.from("iter")];
    const reader = new StreamReader(source);
    const all = await reader.readAll();
    expect(all.toString()).toBe("synciter");
  });

  test("read() returns terminal value when done with value", async () => {
    async function* generate() {
      yield Buffer.from("chunk");
      return Buffer.from("final");
    }
    const reader = new StreamReader(generate());

    const first = await reader.read();
    expect(first.toString()).toBe("chunk");

    const terminal = await reader.read();
    expect(terminal.toString()).toBe("final");

    const done = await reader.read();
    expect(done).toBeNull();
  });

  test("close() does not call return() after done completion", async () => {
    let returnCalled = false;
    const source = {
      [Symbol.asyncIterator]() {
        return {
          _calls: 0,
          async next() {
            this._calls++;
            if (this._calls <= 2) {
              return { done: false, value: this._calls };
            } else {
              return { done: true, value: undefined };
            }
          },
          async return() {
            returnCalled = true;
            return { done: true, value: undefined };
          },
        };
      },
    };
    const reader = new StreamReader(source);
    await reader.read();
    await reader.read();
    await reader.read(); // done: true
    reader.close();
    expect(returnCalled).toBe(false);
  });

  test("close() calls return() on premature exit", async () => {
    let returnCalled = false;
    const source = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: false, value: 1 };
          },
          async return() {
            returnCalled = true;
            return { done: true, value: undefined };
          },
        };
      },
    };
    const reader = new StreamReader(source);
    await reader.read();
    reader.close();
    expect(returnCalled).toBe(true);
  });
});

describe("Node.js Preview3 canon stream writer", () => {
  test("write() enqueues chunks into underlying WritableStream", async () => {
    const received = [];
    const ws = new WritableStream({
      write(chunk) {
        received.push(chunk);
      },
    });
    const writer = new StreamWriter(ws);

    await writer.write(Buffer.from("hello"));
    await writer.write(Buffer.from("world"));
    await writer.close();

    const combined = Buffer.concat(received).toString();
    expect(combined).toBe("helloworld");
  });

  test("abort() invokes underlying abort", async () => {
    let abortedWith = null;
    const ws = new WritableStream({
      abort(reason) {
        abortedWith = reason;
      },
    });
    const writer = new StreamWriter(ws);

    await writer.abort("oops");
    expect(abortedWith).toBe("oops");
  });

  test("closeWithError() aborts and closes writer", async () => {
    let aborted = false;
    const ws = new WritableStream({
      abort() {
        aborted = true;
      },
    });
    const writer = new StreamWriter(ws);

    await writer.closeWithError(new Error("fail"));
    expect(aborted).toBe(true);
    // subsequent write should throw
    await expect(writer.write(Buffer.from("x"))).rejects.toThrow("StreamWriter is closed");
  });

  test("intoWritableStream() returns original after close", async () => {
    const ws = new WritableStream({ write() {} });
    const writer = new StreamWriter(ws);
    await writer.close();
    const orig = await writer.intoWritableStream();
    expect(orig).toBe(ws);
  });
});

describe("stream() helper", () => {
  test("round-trip write then read", async () => {
    const { tx, rx } = stream();
    const payload = Buffer.from("roundtrip");

    await tx.write(payload);
    await tx.close();

    const chunk1 = await rx.read();
    expect(chunk1).toEqual(payload);

    const done = await rx.read();
    expect(done).toBeNull();
  });
});

describe("readableByteStreamFromReader()", () => {
  test("uses read options and normalizes byte arrays", async () => {
    const calls = [];
    const source = {
      async read(options) {
        calls.push(options);
        if (calls.length === 1) {
          return { value: [65, 66, 67], done: false };
        }
        return { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() {
        throw new Error("read should be used when available");
      },
    };

    const reader = readableByteStreamFromReader(source, { chunkSize: 3 }).getReader();
    const first = await reader.read();
    const second = await reader.read();

    expect(calls).toEqual([{ count: 3 }, { count: 3 }]);
    expect(first.done).toBe(false);
    expect(first.value).toBeInstanceOf(Uint8Array);
    expect([...first.value]).toEqual([65, 66, 67]);
    expect(second.done).toBe(true);
  });

  test("falls back to read() readers", async () => {
    const values = [72, 105, null];
    const source = {
      async read() {
        return values.shift();
      },
    };

    const reader = readableByteStreamFromReader(source).getReader();

    const first = await reader.read();
    const second = await reader.read();
    const done = await reader.read();

    expect([...first.value]).toEqual([72]);
    expect([...second.value]).toEqual([105]);
    expect(done.done).toBe(true);
  });

  test("rejects invalid byte values", async () => {
    const source = {
      async read() {
        return { value: [256], done: false };
      },
    };

    const reader = readableByteStreamFromReader(source).getReader();

    await expect(reader.read()).rejects.toThrow("Invalid byte stream value: 256");
  });
});
