import { describe, expect, test } from "vitest";
import {
  Readable,
  Writable,
  Duplex,
  PassThrough,
  promises,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/index.js";

describe("classic/Web Stream adapters", () => {
  test.concurrent("propagates an already-aborted signal to Web reader cancellation", async () => {
    let canceled: unknown;
    const web = new ReadableStream({
      cancel(reason: unknown): void {
        canceled = reason;
      },
    });
    const source = Readable.fromWeb(web, { signal: AbortSignal.abort("stop") });
    await expect(promises.finished(source)).rejects.toMatchObject({ code: "ABORT_ERR" });
    expect(canceled).toMatchObject({ code: "ABORT_ERR" });
  });
  test.concurrent("round-trips readable bytes without transferring the original buffer", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const web = Readable.toWeb(Readable.from([bytes], { objectMode: false }));
    const chunks = await Readable.fromWeb(web).toArray();
    expect(Array.from(chunks[0] as Uint8Array)).toEqual([1, 2, 3]);
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  test.concurrent("preserves object-mode chunks and queue strategy", async () => {
    const object = { value: 42 };
    const sized: unknown[] = [];
    const web = Readable.toWeb(Readable.from([object]), {
      strategy: {
        highWaterMark: 1,
        size(value): number {
          sized.push(value);
          return 1;
        },
      },
    });
    expect(await Readable.fromWeb(web, { objectMode: true }).toArray()).toEqual([object]);
    expect(sized.every((value: unknown): boolean => value === object)).toBe(true);
  });

  test.concurrent("supports BYOB reads and EOF", async () => {
    const original = new Uint8Array([1, 2, 3]);
    const web = Readable.toWeb(Readable.from([original], { objectMode: false }), { type: "bytes" });
    const reader = web.getReader({ mode: "byob" });
    const first = await reader.read(new Uint8Array(4));
    expect(Array.from(first.value!)).toEqual([1, 2, 3]);
    expect((await reader.read(new Uint8Array(4))).done).toBe(true);
    expect(Array.from(original)).toEqual([1, 2, 3]);
  });

  test.concurrent("cancels the underlying Web reader on destruction", async () => {
    let canceled: unknown;
    const web = new ReadableStream({
      cancel(reason: unknown): void {
        canceled = reason;
      },
    });
    const source = Readable.fromWeb(web);
    const error = new Error("cancel reader");
    const complete = promises.finished(source);
    source.destroy(error);
    await expect(complete).rejects.toBe(error);
    expect(canceled).toBe(error);
  });

  test.concurrent("propagates Web reader failure", async () => {
    const error = new Error("read failed");
    const web = new ReadableStream({
      start(controller): void {
        controller.error(error);
      },
    });
    await expect(Readable.fromWeb(web).toArray()).rejects.toBe(error);
  });

  test.concurrent("round-trips writes, batches, and close", async () => {
    const chunks: string[] = [];
    let closed = false;
    const original = new WritableStream({
      write(chunk: unknown): void {
        chunks.push(String(chunk));
      },
      close(): void {
        closed = true;
      },
    });
    const classic = Writable.fromWeb(original);
    classic.cork();
    classic.write("a");
    classic.write("b");
    classic.uncork();
    const writer = Writable.toWeb(classic).getWriter();
    await writer.write(new Uint8Array([99]));
    await writer.close();
    expect(chunks.join("")).toBe("abc");
    expect(closed).toBe(true);
  });

  test.concurrent("waits for classic backpressure and propagates sink errors", async () => {
    let release!: () => void;
    const sink = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback): void {
        release = callback;
      },
    });
    const writer = Writable.toWeb(sink).getWriter();
    let completed = false;
    const pending = writer.write("a").then((): void => {
      completed = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    await pending;
    await writer.close();
    const failure = new Error("web sink failed");
    const broken = Writable.fromWeb(
      new WritableStream({
        write(): never {
          throw failure;
        },
      }),
    );
    const done = promises.finished(broken);
    broken.end("x");
    await expect(done).rejects.toBe(failure);
  });

  test.concurrent("round-trips a Web transform pair", async () => {
    const transform = new TransformStream<Uint8Array, Uint8Array>();
    const duplex = Duplex.fromWeb(transform, { highWaterMark: 4 });
    expect(duplex.readableHighWaterMark).toBe(4);
    expect(duplex.writableHighWaterMark).toBe(4);
    const output = duplex.toArray();
    duplex.end("paired");
    expect(String((await output)[0])).toBe("paired");
    const classic = new PassThrough();
    const pair = Duplex.toWeb(classic);
    const result = Readable.fromWeb(pair.readable).toArray();
    const writer = pair.writable.getWriter();
    await writer.write(new Uint8Array([65]));
    await writer.close();
    expect(String((await result)[0])).toBe("A");
  });

  test.concurrent("rejects the deprecated Duplex.toWeb type alias before touching the stream", () => {
    const source = new Proxy(
      {},
      {
        get(): never {
          throw new Error("source touched");
        },
      },
    );
    expect(() => Reflect.apply(Duplex.toWeb, undefined, [source, { type: "bytes" }])).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
  });

  test.concurrent("readable completion does not wait for a half-open writable side", async () => {
    const duplex = new Duplex({
      allowHalfOpen: true,
      read(): void {
        this.push(null);
      },
      write(_chunk, _encoding, callback): void {
        callback();
      },
    });
    const reader = Duplex.toWeb(duplex).readable.getReader();
    expect((await reader.read()).done).toBe(true);
    expect(duplex.writableEnded).toBe(false);
    duplex.end();
    await promises.finished(duplex);
  });

  test.concurrent("rejects invalid options without locking the supplied streams", () => {
    const readable = new ReadableStream();
    expect(() => Readable.fromWeb(readable, { highWaterMark: -1 })).toThrow();
    expect(readable.locked).toBe(false);
    const writable = new WritableStream();
    expect(() => Writable.fromWeb(writable, { highWaterMark: -1 })).toThrow();
    expect(writable.locked).toBe(false);
  });
});
