import { describe, expect, test } from "vitest";
import {
  Readable,
  Writable,
  pipeline,
  finished,
  promises,
  addAbortSignal,
  isReadable,
  isWritable,
  isDisturbed,
  isErrored,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/index.js";

describe("stream lifecycle helpers", () => {
  test.concurrent("returns the asynchronous pipeline destination's result", async () => {
    const total: number = await promises.pipeline(
      Readable.from([1, 2, 3]),
      async (source): Promise<number> => {
        let sum = 0;
        for await (const value of source) {
          sum += value;
        }
        return sum;
      },
    );
    expect(total).toBe(6);
  });
  test.concurrent("pipelines Web sources without relying on async iteration", async () => {
    const source = new ReadableStream({
      start(controller): void {
        controller.enqueue(new Uint8Array([65]));
        controller.close();
      },
    });
    Object.defineProperty(source, Symbol.asyncIterator, { value: undefined });
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback): void {
        chunks.push(String(chunk));
        callback();
      },
    });
    await promises.pipeline(source, sink);
    expect(chunks).toEqual(["A"]);
  });

  test.concurrent("retains a Web pipeline destination's identity", async () => {
    const chunks: unknown[] = [];
    const sink = new WritableStream({
      write(chunk: unknown): void {
        chunks.push(chunk);
      },
    });
    await new Promise<void>((resolve, reject): void => {
      const returned = pipeline(Readable.from([1, 2]), sink, (error): void => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      expect(returned).toBe(sink);
    });
    expect(chunks).toEqual([1, 2]);
  });

  test.concurrent("finishes and returns cleanup for classic streams", async () => {
    const source = Readable.from([]);
    await new Promise<void>((resolve, reject): void => {
      const cleanup = finished(source, (error): void => {
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      source.resume();
    });
    expect(source.listenerCount("error")).toBe(0);
  });

  test.concurrent("reports unavailable Web internal-state APIs explicitly without locking", async () => {
    const source = new ReadableStream();
    for (const predicate of [isReadable, isWritable, isDisturbed, isErrored]) {
      expect(() => predicate(source)).toThrow(
        expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
      );
    }
    expect(() => finished(source, (): void => {})).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    await expect(promises.finished(source)).rejects.toMatchObject({
      code: "ERR_JCO_UNSUPPORTED_NODE_API",
    });
    expect(() => addAbortSignal(new AbortController().signal, source)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(source.locked).toBe(false);
  });
});
