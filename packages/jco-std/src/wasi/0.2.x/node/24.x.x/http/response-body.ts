export type ResponseBodyEvent =
  | { tag: "pending" }
  | { tag: "chunk"; val: Uint8Array }
  | { tag: "end" };

/** Guest-owned body queue, drained incrementally by the HTTP host. */
export class ResponseBody implements Disposable {
  #chunks: Uint8Array[] = [];
  #bytes = 0;
  #ended = false;
  #error: Error | undefined;
  #disposed = false;
  constructor(
    readonly drain: () => void,
    readonly close: () => void,
  ) {}

  write(bytes: Uint8Array): boolean {
    if (this.#disposed) {
      return false;
    }
    if (bytes.length) {
      this.#chunks.push(bytes.slice());
      this.#bytes += bytes.length;
    }
    return this.#bytes < 64 * 1024;
  }
  end(): void {
    this.#ended = true;
  }
  fail(error: Error): void {
    this.#error = error;
  }

  async poll(): Promise<ResponseBodyEvent> {
    // Give the engine's task scheduler a turn while the host drains the body.
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
    if (this.#error) {
      throw {
        name: this.#error.name,
        message: this.#error.message,
        code: (this.#error as Error & { code?: string }).code,
      };
    }
    if (this.#chunks.length) {
      const wasFull = this.#bytes >= 64 * 1024;
      const size = Math.min(this.#bytes, 64 * 1024);
      const chunk = new Uint8Array(size);
      let offset = 0,
        consumed = 0;
      while (offset < size) {
        const next = this.#chunks[consumed];
        const length = Math.min(next.length, size - offset);
        chunk.set(next.subarray(0, length), offset);
        offset += length;
        if (length < next.length) {
          this.#chunks[consumed] = next.subarray(length);
          break;
        }
        consumed++;
      }
      this.#chunks.splice(0, consumed);
      this.#bytes -= size;
      if (wasFull && this.#bytes < 64 * 1024) {
        queueMicrotask(this.drain);
      }
      return { tag: "chunk", val: chunk };
    }
    return { tag: this.#ended ? "end" : "pending" };
  }

  [Symbol.dispose](): void {
    if (!this.#disposed) {
      this.#disposed = true;
      this.#ended = true;
      this.#chunks = [];
      this.#bytes = 0;
      this.close();
    }
  }
}
