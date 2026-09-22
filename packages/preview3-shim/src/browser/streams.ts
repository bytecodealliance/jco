const symbolDispose = Symbol.dispose ?? Symbol.for("dispose");
const BYTE_CHUNK_SIZE = 64 * 1024;
const P2_WRITE_CHUNK_SIZE = 4096;

interface Preview2InputStream {
  blockingRead(length: bigint): Uint8Array | Promise<Uint8Array>;
  subscribe(): { block(): void | Promise<void> };
}

interface Preview2OutputStream {
  blockingWriteAndFlush(contents: Uint8Array): void;
  blockingFlush(): void;
}

type StreamReaderLike = {
  read(options?: { count: number }): Promise<unknown> | unknown;
  cancel?(reason?: unknown): Promise<void> | void;
  close?(): void;
  [symbolDispose]?: () => void;
};

function byteChunk(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(`invalid byte stream value: ${value}`);
    }
    return Uint8Array.of(value);
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  throw new TypeError("byte stream values must be bytes or byte arrays");
}

function isIteratorResult(value: unknown): value is IteratorResult<unknown> {
  return value !== null && typeof value === "object" && "done" in value;
}

async function* byteChunks(data: ReadableStream<number>): AsyncGenerator<Uint8Array> {
  const stream = data as ReadableStream<number> &
    Partial<StreamReaderLike> &
    Partial<AsyncIterable<unknown>>;

  if (typeof stream.read === "function") {
    while (true) {
      const value = await stream.read({ count: BYTE_CHUNK_SIZE });
      if (isIteratorResult(value)) {
        if (value.done) {
          return;
        }
        yield byteChunk(value.value);
      } else if (value === null) {
        return;
      } else {
        yield byteChunk(value);
      }
    }
  }

  if (typeof stream[Symbol.asyncIterator] === "function") {
    for await (const value of stream as AsyncIterable<unknown>) {
      yield byteChunk(value);
    }
    return;
  }

  throw new TypeError("byte stream must provide read() or [Symbol.asyncIterator]()");
}

export async function writeToPreview2Output(
  data: ReadableStream<number>,
  output: Preview2OutputStream,
): Promise<void> {
  for await (const bytes of byteChunks(data)) {
    for (let offset = 0; offset < bytes.byteLength; offset += P2_WRITE_CHUNK_SIZE) {
      output.blockingWriteAndFlush(bytes.subarray(offset, offset + P2_WRITE_CHUNK_SIZE));
    }
  }
  output.blockingFlush();
}

export function readableFromPreview2Input<E>(
  input: Preview2InputStream,
  errorCode: (error: unknown) => E,
): [ReadableStream<number>, Promise<{ tag: "ok"; val: void } | { tag: "err"; val: E }>] {
  let resolveResult: (result: { tag: "ok"; val: void } | { tag: "err"; val: E }) => void = () => {};
  const result = new Promise<{ tag: "ok"; val: void } | { tag: "err"; val: E }>(
    (resolve) => (resolveResult = resolve),
  );
  let settled = false;
  const settle = (value: { tag: "ok"; val: void } | { tag: "err"; val: E }) => {
    if (!settled) {
      settled = true;
      resolveResult(value);
    }
  };

  const readable = new ReadableStream<number>({
    async pull(controller) {
      try {
        const bytes = await input.blockingRead(BigInt(BYTE_CHUNK_SIZE));
        for (const byte of bytes) {
          controller.enqueue(byte);
        }
      } catch (error) {
        if ((error as { tag?: string })?.tag === "closed") {
          controller.close();
          settle({ tag: "ok", val: undefined });
          return;
        }
        settle({ tag: "err", val: errorCode(error) });
        controller.error(error);
      }
    },
    cancel() {
      settle({ tag: "ok", val: undefined });
    },
  });
  return [readable, result];
}

export function preview2StreamErrorCode(error: unknown): "io" | "illegal-byte-sequence" | "pipe" {
  const code = (error as { code?: string })?.code;
  if (code === "EPIPE" || code === "ERR_STREAM_PREMATURE_CLOSE") {
    return "pipe";
  }
  if (code === "ERR_ENCODING_INVALID_ENCODED_DATA") {
    return "illegal-byte-sequence";
  }
  return "io";
}
