import { describe, expect, test } from "vitest";
import {
  Writable,
  PassThrough,
  Readable,
  Transform,
  promises,
  addAbortSignal,
  duplexPair,
  compose,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/index.js";
import type { Callback } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/types.js";

describe("classic Writable, Duplex and Transform", () => {
  test.concurrent("tracks backpressure, drain, length, and completion", async () => {
    let written!: Callback;
    const events: string[] = [];
    const sink = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback): void {
        written = callback;
      },
    });
    sink.on("drain", (): void => {
      events.push("drain");
    });
    expect(sink.write("a")).toBe(false);
    expect(sink.writableNeedDrain).toBe(true);
    expect(sink.writableLength).toBe(1);
    written();
    expect(sink.writableLength).toBe(0);
    expect(events).toEqual(["drain"]);
    sink.end();
    await promises.finished(sink, { cleanup: true });
    expect(sink.writableFinished).toBe(true);
    expect(sink.listenerCount("error")).toBe(0);
  });

  test.concurrent("batches corked writes through writev before final", async () => {
    const batches: unknown[][] = [];
    const events: string[] = [];
    const sink = new Writable({
      objectMode: true,
      writev(chunks, callback): void {
        batches.push(chunks.map((entry): unknown => entry.chunk));
        callback();
      },
      final(callback): void {
        events.push("final");
        callback();
      },
    });
    sink.cork();
    sink.cork();
    sink.write(1);
    sink.write(2);
    expect(sink.writableCorked).toBe(2);
    sink.uncork();
    expect(batches).toEqual([]);
    sink.end();
    await promises.finished(sink);
    expect(batches).toEqual([[1, 2]]);
    expect(events).toEqual(["final"]);
  });

  test.concurrent("accepts DataViews through write and end, including Duplex", async () => {
    const output: number[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback): void {
        output.push(...(chunk as Uint8Array));
        callback();
      },
    });
    sink.write(new DataView(new Uint8Array([0, 1, 2, 0]).buffer, 1, 2));
    sink.end(new DataView(new Uint8Array([3]).buffer));
    await promises.finished(sink);
    expect(output).toEqual([1, 2, 3]);
    const duplex = new PassThrough<Uint8Array>();
    duplex.end(new DataView(new Uint8Array([4, 5]).buffer));
    expect(Array.from((await duplex.toArray())[0])).toEqual([4, 5]);
  });

  test.concurrent("pipelines transforms, flushes, and aborts all stages on error", async () => {
    const chunks: string[] = [];
    const transform = new Transform({
      transform(chunk, _encoding, callback): void {
        callback(null, String(chunk).toUpperCase());
      },
      flush(callback): void {
        callback(null, "!");
      },
    });
    const sink = new Writable({
      write(chunk, _encoding, callback): void {
        chunks.push(String(chunk));
        callback();
      },
    });
    await promises.pipeline(Readable.from(["a", "b"]), transform, sink);
    expect(chunks.join("")).toBe("AB!");
    const failure = new Error("write failed");
    const source = Readable.from([1, 2, 3]);
    const broken = new Writable({
      objectMode: true,
      write(_chunk, _encoding, callback): void {
        callback(failure);
      },
    });
    await expect(promises.pipeline(source, broken)).rejects.toBe(failure);
    expect(source.destroyed).toBe(true);
    expect(broken.destroyed).toBe(true);
  });

  test.concurrent("supports abort signals and async disposal", async () => {
    const sink = new Writable({
      write(_chunk, _encoding, callback): void {
        callback();
      },
    });
    const controller = new AbortController();
    expect(addAbortSignal(controller.signal, sink)).toBe(sink);
    const complete = promises.finished(sink);
    controller.abort();
    await expect(complete).rejects.toMatchObject({ code: "ABORT_ERR" });
    const disposable = new Writable({
      write(_chunk, _encoding, callback): void {
        callback();
      },
    });
    await disposable[Symbol.asyncDispose]();
    expect(disposable.destroyed).toBe(true);
  });

  test.concurrent("connects duplexPair in both directions with backpressure and EOF", async () => {
    const [first, second] = duplexPair({ objectMode: true, highWaterMark: 1 });
    const firstValues = first.toArray();
    const secondValues = second.toArray();
    expect(first.write("outbound")).toBe(false);
    second.write("inbound");
    first.end();
    second.end();
    expect(await firstValues).toEqual(["inbound"]);
    expect(await secondValues).toEqual(["outbound"]);
    await Promise.all([promises.finished(first), promises.finished(second)]);
  });

  test.concurrent("composes async generator transforms", async () => {
    const result = compose(async function* (
      source: AsyncIterable<unknown>,
    ): AsyncGenerator<string> {
      for await (const chunk of source) {
        yield String(chunk).toUpperCase();
      }
    });
    const output = result.toArray();
    result.end("composed");
    expect(await output).toEqual(["COMPOSED"]);
  });
});
