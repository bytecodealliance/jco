import type {
  error as ErrorNamespace,
  poll as PollNamespace,
  streams as StreamsNamespace,
} from "../../types/io.js";

let id = 0;

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

type IInputStream = StreamsNamespace.InputStream;
type IOutputStream = StreamsNamespace.OutputStream;

/**
 * Handler interface for creating custom input streams
 */
export type InputStreamHandler = Partial<IInputStream> &
  Required<Pick<IInputStream, "blockingRead">> & {
    drop?: () => void;
  };

/**
 * Handler interface for creating custom output streams
 */
export type OutputStreamHandler = Partial<IOutputStream> &
  Required<Pick<IOutputStream, "write">> & {
    drop?: () => void;
  };

class IoError extends Error implements ErrorNamespace.Error {
  toDebugString() {
    return this.message;
  }
}

class InputStream implements IInputStream {
  id!: number;
  handler!: InputStreamHandler;

  static _create(handler: InputStreamHandler) {
    const stream = new InputStream();
    if (!handler) {
      console.trace("no handler");
    }
    stream.id = ++id;
    stream.handler = handler;
    return stream;
  }

  read(len: bigint) {
    if (this.handler.read) {
      return this.handler.read(len);
    }
    return this.handler.blockingRead.call(this, len);
  }

  blockingRead(len: bigint) {
    return this.handler.blockingRead.call(this, len);
  }

  skip(len: bigint) {
    if (this.handler.skip) {
      return this.handler.skip.call(this, len);
    }
    if (this.handler.read) {
      const bytes = this.handler.read.call(this, len);
      return BigInt(bytes.byteLength);
    }
    return this.blockingSkip.call(this, len);
  }

  blockingSkip(len: bigint) {
    if (this.handler.blockingSkip) {
      return this.handler.blockingSkip.call(this, len);
    }
    const bytes = this.handler.blockingRead.call(this, len);
    return BigInt(bytes.byteLength);
  }

  subscribe() {
    if (this.handler.subscribe) {
      return this.handler.subscribe();
    }
    return new Pollable();
  }

  [symbolDispose]() {
    if (this.handler.drop) {
      this.handler.drop.call(this);
    }
  }
}

export const inputStreamCreate = InputStream._create;
// @ts-expect-error - Deleting static method
delete InputStream._create;

class OutputStream implements IOutputStream {
  id!: number;
  open!: boolean;
  handler!: OutputStreamHandler;

  static _create(handler: OutputStreamHandler) {
    const stream = new OutputStream();
    if (!handler) {
      console.trace("no handler");
    }
    stream.id = ++id;
    stream.open = true;
    stream.handler = handler;
    return stream;
  }

  checkWrite() {
    if (!this.open) {
      return 0n;
    }
    if (this.handler.checkWrite) {
      return this.handler.checkWrite.call(this);
    }
    return 1_000_000n;
  }

  write(buf: Uint8Array) {
    this.handler.write.call(this, buf);
  }

  blockingWriteAndFlush(buf: Uint8Array) {
    if (this.handler.blockingWriteAndFlush) {
      return this.handler.blockingWriteAndFlush.call(this, buf);
    }
    this.handler.write.call(this, buf);
  }

  flush() {
    if (this.handler.flush) {
      this.handler.flush.call(this);
    }
  }

  blockingFlush() {
    this.open = true;
    if (this.handler.blockingFlush) {
      this.handler.blockingFlush.call(this);
    }
  }

  writeZeroes(len: bigint) {
    this.write.call(this, new Uint8Array(Number(len)));
  }

  blockingWriteZeroesAndFlush(len: bigint) {
    this.blockingWriteAndFlush.call(this, new Uint8Array(Number(len)));
  }

  splice(src: InputStream, len: bigint) {
    const spliceLen = Math.min(Number(len), Number(this.checkWrite.call(this)));
    const bytes = src.read(BigInt(spliceLen));
    this.write.call(this, bytes);
    return BigInt(bytes.byteLength);
  }

  blockingSplice(_src: InputStream, _len: bigint) {
    console.log(`[streams] Blocking splice ${this.id}`);
    return 0n;
  }

  subscribe() {
    if (this.handler.subscribe) {
      return this.handler.subscribe();
    }
    return new Pollable();
  }

  [symbolDispose]() {}
}

export const outputStreamCreate = OutputStream._create;
// @ts-expect-error - Deleting static method
delete OutputStream._create;

export const error: typeof ErrorNamespace = {
  Error: IoError,
};

export const streams: typeof StreamsNamespace = { InputStream, OutputStream };

class Pollable implements PollNamespace.Pollable {
  #ready = false;
  #promise: Promise<void> | null = null;

  static _create(promise?: Promise<void>) {
    const pollable = new Pollable();
    if (!promise) {
      pollable.#ready = true;
    } else {
      pollable.#promise = promise.then(
        () => {
          pollable.#ready = true;
        },
        () => {
          pollable.#ready = true;
        },
      );
    }
    return pollable;
  }

  ready() {
    return this.#ready;
  }

  block() {
    if (this.#ready) {
      return Promise.resolve();
    }
    return this.#promise || Promise.resolve();
  }

  [symbolDispose]() {
    this.#promise = null;
  }
}

export const pollableCreate = Pollable._create;
// @ts-expect-error - Deleting static method
delete Pollable._create;

function pollList(list: Pollable[]): Uint32Array | Promise<Uint32Array> {
  if (list.length === 0) {
    throw new Error("poll list must not be empty");
  }
  if (list.length > 0xffffffff) {
    throw new Error("poll list length exceeds u32 index range");
  }
  const ready: number[] = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].ready()) {
      ready.push(i);
    }
  }
  if (ready.length > 0) {
    return new Uint32Array(ready);
  }
  // None ready synchronously. Wait for the first to resolve via Promise.race,
  // then sweep for any others that became ready concurrently.
  return Promise.race(
    list.map((p, i) =>
      p.block().then(() => {
        const result = [i];
        for (let j = 0; j < list.length; j++) {
          if (j !== i && list[j].ready()) {
            result.push(j);
          }
        }
        return new Uint32Array(result);
      }),
    ),
  );
}

function pollOne(poll: Pollable): Promise<void> {
  return poll.block();
}

export const poll: typeof PollNamespace = {
  Pollable,
  pollList,
  pollOne,
  // @ts-expect-error Not matching signature from WIT
  poll: pollList,
};
