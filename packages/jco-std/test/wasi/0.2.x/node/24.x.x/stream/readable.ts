import { describe, expect, test } from "vitest";
import { Readable, promises } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/index.js";

describe("classic Readable", () => {
  test.concurrent("pulls lazily, supports unshift, and decodes split UTF-8", async () => {
    const source = new Readable<string>({ read(): void {} });
    source.setEncoding("utf8");
    source.push(new Uint8Array([0xe2]));
    expect(source.read()).toBe(null);
    source.push(new Uint8Array([0x82, 0xac]));
    expect(source.read()).toBe("€");
    source.unshift("front");
    expect(source.read()).toBe("front");
    source.push(null);
    source.resume();
    await promises.finished(source);
  });

  test.concurrent("accepts offset DataViews and arbitrary typed-array bytes", async () => {
    const source = new Readable<Uint8Array>({ read(): void {} });
    source.push(new DataView(new Uint8Array([0, 65, 66, 0]).buffer, 1, 2));
    source.push(new Uint16Array([0x0102]));
    source.push(null);
    const chunks = await source.toArray();
    expect(Array.from(chunks[0])).toEqual([
      65,
      66,
      ...new Uint8Array(new Uint16Array([0x0102]).buffer),
    ]);
  });

  test.concurrent("waits for construct before read and propagates construction errors", async () => {
    const events: string[] = [];
    const source = new Readable({
      construct(callback): void {
        events.push("construct");
        queueMicrotask((): void => {
          events.push("ready");
          callback();
        });
      },
      read(): void {
        events.push("read");
        this.push(null);
      },
    });
    await source.toArray();
    expect(events).toEqual(["construct", "ready", "read"]);
    const failure = new Error("construct failed");
    const broken = new Readable({
      construct(callback): void {
        callback(failure);
      },
    });
    await expect(broken.toArray()).rejects.toBe(failure);
  });

  test.concurrent("destroys on iterator return unless explicitly disabled", async () => {
    const source = Readable.from([1, 2, 3]);
    const iterator = source.iterator({ destroyOnReturn: false });
    expect(await iterator.next()).toEqual({ value: 1, done: false });
    await iterator.return?.();
    expect(source.destroyed).toBe(false);
    expect(await source.toArray()).toEqual([2, 3]);
    const destroyed = Readable.from([1, 2]);
    for await (const value of destroyed) {
      expect(value).toBe(1);
      break;
    }
    expect(destroyed.destroyed).toBe(true);
  });

  test.concurrent("cleans up an iterable on destruction and rejects null chunks", async () => {
    let returned = false;
    async function* source(): AsyncGenerator<number> {
      try {
        yield 1;
        yield 2;
      } finally {
        returned = true;
      }
    }
    for await (const value of Readable.from(source())) {
      expect(value).toBe(1);
      break;
    }
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 0);
    });
    expect(returned).toBe(true);
    await expect(Readable.from([null]).toArray()).rejects.toMatchObject({
      code: "ERR_STREAM_NULL_VALUES",
    });
  });

  test.concurrent("implements the readable operators", async () => {
    const source = (): Readable<number> => Readable.from([1, 2, 3, 4]);
    expect(
      await source()
        .map(async (n: number): Promise<number> => n * 2, { concurrency: 2 })
        .filter((n: number): boolean => n > 4)
        .toArray(),
    ).toEqual([6, 8]);
    expect(
      await source()
        .flatMap((n: number): number[] => [n, n])
        .drop(2)
        .take(3)
        .toArray(),
    ).toEqual([2, 2, 3]);
    expect(await source().some((n: number): boolean => n === 3)).toBe(true);
    expect(await source().every((n: number): boolean => n < 5)).toBe(true);
    expect(await source().find((n: number): boolean => n > 2)).toBe(3);
    expect(await source().reduce((a: number, b: number): number => a + b, 0)).toBe(10);
    const visited: number[] = [];
    await source().forEach((n: number): void => {
      visited.push(n);
    });
    expect(visited).toEqual([1, 2, 3, 4]);
    await expect(
      source()
        .map((): never => {
          throw new Error("map failed");
        })
        .toArray(),
    ).rejects.toThrow("map failed");
  });

  test.concurrent("supports async disposal of both unfinished and ended streams", async () => {
    const source = Readable.from([1, 2]);
    await source[Symbol.asyncDispose]();
    expect(source.destroyed).toBe(true);
    expect(source.errored).toMatchObject({ code: "ABORT_ERR" });
    const ended = Readable.from([]);
    await ended.toArray();
    await ended[Symbol.asyncDispose]();
    expect(ended.errored).toBe(null);
  });
});
