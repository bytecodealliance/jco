import { describe, test, expect } from "vitest";

const { StreamReader, StreamWriter, stream } = await import("@bytecodealliance/preview3-shim/stream");

describe("Node.js Preview3 canon stream reader", () => {
  test("read() yields chunks and null at end", async () => {
    const rs = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new Uint8Array([1]));
        ctrl.enqueue(new Uint8Array([2]));
        ctrl.close();
      }
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

  test("readAll() concatenates multiple chunks", async () => {
    const rs = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(Buffer.from("foo"));
        ctrl.enqueue(Buffer.from("bar"));
        ctrl.close();
      }
    });
    const reader = new StreamReader(rs);
    const all = await reader.readAll();
    expect(all.toString()).toBe("foobar");
  });
});

describe("Node.js Preview3 canon stream writer", () => {
  test("write() enqueues chunks into underlying WritableStream", async () => {
    const received = [];
    const ws = new WritableStream({
      write(chunk) { received.push(chunk); }
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
      abort(reason) { abortedWith = reason; }
    });
    const writer = new StreamWriter(ws);

    await writer.abort("oops");
    expect(abortedWith).toBe("oops");
  });

  test("closeWithError() aborts and closes writer", async () => {
    let aborted = false;
    const ws = new WritableStream({
      abort() { aborted = true; }
    });
    const writer = new StreamWriter(ws);

    await writer.closeWithError(new Error("fail"));
    expect(aborted).toBe(true);
    // subsequent write should throw
    await expect(writer.write(Buffer.from("x"))).rejects.toThrow("StreamWriter is closed");
  });

  test("intoStream() returns original after close", async () => {
    const ws = new WritableStream({ write() {} });
    const writer = new StreamWriter(ws);
    await writer.close();
    const orig = writer.intoStream();
    expect(orig).toBe(ws);
  });
});
