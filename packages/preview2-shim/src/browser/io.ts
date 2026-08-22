import type {
    error as ErrorNamespace,
    poll as PollNamespace,
    streams as StreamsNamespace,
} from "../../types/io.js";

let id = 0;

const MAX_U64 = (1n << 64n) - 1n;

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

export interface PollableSource {
    ready(): boolean;
    wait(): Promise<void>;
}

function checkedLength(len: bigint, name = "length"): number {
    if (typeof len !== "bigint" || len < 0n || len > MAX_U64) {
        throw new TypeError(`${name} must be a valid u64`);
    }
    if (len > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError(`${name} exceeds JavaScript's safe integer range`);
    }
    return Number(len);
}

function closed(): never {
    throw { tag: "closed" } satisfies StreamsNamespace.StreamError;
}

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

export const ioErrorCreate = (message: string): ErrorNamespace.Error => new IoError(message);

class InputStream implements IInputStream {
    id!: number;
    handler!: InputStreamHandler;
    #open = true;
    #children = new Set<Pollable>();

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
        checkedLength(len);
        if (!this.#open) {
            closed();
        }
        if (this.handler.read) {
            return this.handler.read.call(this, len);
        }
        return this.handler.blockingRead.call(this, len);
    }

    blockingRead(len: bigint) {
        checkedLength(len);
        if (!this.#open) {
            closed();
        }
        return this.handler.blockingRead.call(this, len);
    }

    skip(len: bigint) {
        checkedLength(len);
        if (!this.#open) {
            closed();
        }
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
        checkedLength(len);
        if (!this.#open) {
            closed();
        }
        if (this.handler.blockingSkip) {
            return this.handler.blockingSkip.call(this, len);
        }
        const bytes = this.handler.blockingRead.call(this, len);
        return BigInt(bytes.byteLength);
    }

    subscribe() {
        if (!this.#open) {
            return pollableCreate();
        }
        const pollable = this.handler.subscribe
            ? this.handler.subscribe.call(this)
            : pollableCreate();
        if (pollable instanceof Pollable) {
            this.#children.add(pollable);
            pollable._onDispose(() => this.#children.delete(pollable));
        }
        return pollable;
    }

    [symbolDispose]() {
        if (!this.#open) {
            return;
        }
        this.#open = false;
        for (const child of this.#children) {
            child._invalidate();
        }
        this.#children.clear();
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
    #permit = 0n;
    #children = new Set<Pollable>();

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
            closed();
        }
        if (this.handler.checkWrite) {
            const permit = this.handler.checkWrite.call(this);
            checkedLength(permit, "write permit");
            this.#permit = permit;
            return permit;
        }
        this.#permit = 1_000_000n;
        return this.#permit;
    }

    write(buf: Uint8Array) {
        if (!this.open) {
            closed();
        }
        if (BigInt(buf.byteLength) > this.#permit) {
            throw new Error("write exceeds the permit returned by checkWrite");
        }
        this.#permit -= BigInt(buf.byteLength);
        this.handler.write.call(this, buf);
    }

    blockingWriteAndFlush(buf: Uint8Array) {
        if (!this.open) {
            closed();
        }
        if (buf.byteLength > 4096) {
            throw new RangeError("blockingWriteAndFlush accepts at most 4096 bytes");
        }
        if (this.handler.blockingWriteAndFlush) {
            return this.handler.blockingWriteAndFlush.call(this, buf);
        }
        this.handler.write.call(this, buf);
        if (this.handler.blockingFlush) {
            this.handler.blockingFlush.call(this);
        } else {
            this.handler.flush?.call(this);
        }
    }

    flush() {
        if (!this.open) {
            closed();
        }
        this.#permit = 0n;
        if (this.handler.flush) {
            this.handler.flush.call(this);
        }
    }

    blockingFlush() {
        if (!this.open) {
            closed();
        }
        if (this.handler.blockingFlush) {
            this.handler.blockingFlush.call(this);
        } else {
            this.handler.flush?.call(this);
        }
    }

    writeZeroes(len: bigint) {
        const length = checkedLength(len);
        if (len > this.#permit) {
            throw new Error("write exceeds the permit returned by checkWrite");
        }
        this.write.call(this, new Uint8Array(length));
    }

    blockingWriteZeroesAndFlush(len: bigint) {
        const length = checkedLength(len);
        if (length > 4096) {
            throw new RangeError("blockingWriteZeroesAndFlush accepts at most 4096 bytes");
        }
        this.blockingWriteAndFlush.call(this, new Uint8Array(length));
    }

    splice(src: InputStream, len: bigint) {
        const spliceLen = Math.min(checkedLength(len), Number(this.checkWrite.call(this)));
        const bytes = src.read(BigInt(spliceLen));
        this.write.call(this, bytes);
        return BigInt(bytes.byteLength);
    }

    blockingSplice(src: InputStream, len: bigint) {
        const spliceLen = Math.min(checkedLength(len), Number(this.checkWrite.call(this)));
        const bytes = src.blockingRead(BigInt(spliceLen));
        this.write.call(this, bytes);
        return BigInt(bytes.byteLength);
    }

    subscribe() {
        if (!this.open) {
            return pollableCreate();
        }
        const pollable = this.handler.subscribe
            ? this.handler.subscribe.call(this)
            : pollableCreate();
        if (pollable instanceof Pollable) {
            this.#children.add(pollable);
            pollable._onDispose(() => this.#children.delete(pollable));
        }
        return pollable;
    }

    [symbolDispose]() {
        if (!this.open) {
            return;
        }
        this.open = false;
        this.#permit = 0n;
        for (const child of this.#children) {
            child._invalidate();
        }
        this.#children.clear();
        this.handler.drop?.call(this);
    }
}

export const outputStreamCreate = OutputStream._create;
// @ts-expect-error - Deleting static method
delete OutputStream._create;

export const error: typeof ErrorNamespace = {
    Error: IoError,
};

export const streams: typeof StreamsNamespace = { InputStream, OutputStream };

class Pollable implements PollNamespace.Pollable {
    #source: PollableSource = { ready: () => true, wait: () => Promise.resolve() };
    #invalid = false;
    #disposed = false;
    #wait: Promise<void> | null = null;
    #disposeCallbacks: (() => void)[] = [];

    static _create(source?: Promise<void> | PollableSource) {
        const pollable = new Pollable();
        if (source instanceof Promise) {
            let ready = false;
            const wait = source.then(
                () => {
                    ready = true;
                },
                () => {
                    ready = true;
                },
            );
            pollable.#source = { ready: () => ready, wait: () => wait };
        } else if (source) {
            pollable.#source = source;
        }
        return pollable;
    }

    ready() {
        this.#assertUsable();
        return this.#source.ready();
    }

    block() {
        this.#assertUsable();
        if (this.#source.ready()) {
            return Promise.resolve();
        }
        // Deduplicate simultaneous waiters, but discard a completed wait so a
        // level-triggered source can be polled again after its event is consumed.
        if (!this.#wait) {
            this.#wait = Promise.resolve(this.#source.wait()).finally(() => {
                this.#wait = null;
            });
        }
        return this.#wait;
    }

    _onDispose(callback: () => void) {
        if (this.#disposed) {
            callback();
        } else {
            this.#disposeCallbacks.push(callback);
        }
    }

    _invalidate() {
        this.#invalid = true;
        this.#wait = null;
    }

    #assertUsable() {
        if (this.#disposed) {
            throw new Error("pollable has been disposed");
        }
        if (this.#invalid) {
            throw new Error("pollable's parent resource has been disposed");
        }
    }

    [symbolDispose]() {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        this.#wait = null;
        for (const callback of this.#disposeCallbacks.splice(0)) {
            callback();
        }
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
    return Promise.race(list.map((pollable) => pollable.block())).then(() => {
        const result: number[] = [];
        for (let i = 0; i < list.length; i++) {
            if (list[i].ready()) {
                result.push(i);
            }
        }
        return new Uint32Array(result);
    });
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
