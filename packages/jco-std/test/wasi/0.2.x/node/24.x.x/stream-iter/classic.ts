import { describe, expect, test } from "vitest";

import {
  fromReadable,
  fromWritable,
  text,
  toReadable,
  toReadableSync,
  toWritable,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

class FakeReadable {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private readonly chunks: Array<Uint8Array | null> = [new TextEncoder().encode("classic"), null];
  readableEnded = false;

  read(): Uint8Array | null {
    const value = this.chunks.shift() ?? null;
    if (value === null) {
      this.readableEnded = true;
    }
    return value;
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }
}

describe("stream/iter classic adapters", () => {
  test.concurrent("duck-types readable inputs and caches adapters", async () => {
    const readable = new FakeReadable();
    const adapted = fromReadable(readable);
    expect(fromReadable(readable)).toBe(adapted);
    await expect(text(adapted)).resolves.toBe("classic");
  });

  test.concurrent("duck-types writable inputs and caches per policy", async () => {
    const chunks: Uint8Array[] = [];
    const writable = {
      write(chunk: Uint8Array, callback?: (error?: Error | null) => void): boolean {
        chunks.push(chunk);
        callback?.();
        return true;
      },
      on(): void {},
      end(callback?: (error?: Error | null) => void): void {
        callback?.();
      },
    };
    const adapted = fromWritable(writable);
    expect(fromWritable(writable)).toBe(adapted);
    await adapted.write("written");
    await adapted.end();
    expect(new TextDecoder().decode(chunks[0])).toBe("written");
  });

  test.each([toReadable, toReadableSync, toWritable])(
    "fails unsupported classic outputs before reading inputs",
    (adapter) => {
      const input = new Proxy(
        {},
        {
          get: () => {
            throw new Error("input touched");
          },
        },
      );
      expect(() => adapter(input)).toThrow(
        expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
      );
    },
  );
});
