/**
 * Regular files and directories operated on with `fs.*Sync` on the main
 * thread, without a round trip to the I/O worker.
 *
 * Only files that cannot make a call wait indefinitely are served here. A read
 * of a FIFO, a character device or a socket waits for its other end, and the
 * guest expects to poll such a stream beside others; that needs the event
 * loop of the I/O worker. A regular file or a directory completes every
 * operation within the call, so its streams are always ready and nothing is
 * lost by blocking the main thread for the duration of the call. The main
 * thread is blocked for that long on the worker path as well, waiting for the
 * worker's answer.
 */
import type { Advice } from "@bytecodealliance/jco-node-fs";
import {
    closeSync,
    constants,
    fdatasyncSync,
    fstatSync,
    fsyncSync,
    ftruncateSync,
    futimesSync,
    lstatSync,
    openSync,
    readSync,
    statSync,
    writeSync,
} from "node:fs";

import type { DescriptorType } from "../../types/interfaces/wasi-filesystem-types.js";
import {
    boundedReadLength,
    fadvise,
    lookupType,
    toFileStats,
    toMetadataHash,
    UNCHECKED_READ_LENGTH,
} from "./file-common.js";
import type { FileHandle } from "./file-handle.js";
import { verifyReadyPollablesDropped, type ReadyPollableOwner } from "./ready-pollables.js";
import {
    earlyDispose,
    hostSplice,
    lastOperationFailed,
    readyPollableCreate,
    registerDispose,
    STREAM_CHUNK,
    streams,
    streamTrap,
} from "./worker-io.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

/** `O_NONBLOCK` where the platform has it. */
const O_NONBLOCK = constants.O_NONBLOCK ?? 0;

/** Longest pause between two attempts of an operation that would block, in milliseconds. */
const MAX_RETRY_PAUSE = 32;

let pauseCell: Int32Array | undefined;

/**
 * Run a file operation until it no longer reports that it would block.
 *
 * Files are opened with `O_NONBLOCK` (see `openMainThreadFile`), and Node.js
 * cannot clear the flag afterwards. It means nothing to an ordinary regular
 * file, but a few files that report themselves as regular can wait for data,
 * as some of `procfs` and of FUSE filesystems do, and answer `EAGAIN` instead.
 * The I/O worker would wait in such a call, so this waits too, by trying again
 * after a pause.
 *
 * @param operation - the read or write to run
 * @returns what the operation returns once it goes through
 */
function waitingOut<T>(operation: () => T): T {
    for (let pause = 1; ; pause = Math.min(pause * 2, MAX_RETRY_PAUSE)) {
        try {
            return operation();
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EAGAIN") {
                throw error;
            }
        }
        pauseCell ??= new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(pauseCell, 0, 0, pause);
    }
}

/**
 * Whether operations on a file of this type complete within the call.
 *
 * @param type - the file type
 * @returns true for a regular file or a directory
 */
function completesWithinCall(type: DescriptorType): boolean {
    return type === "regular-file" || type === "directory";
}

/** A file opened on the main thread, shared by its descriptor and its streams. */
class MainThreadFile implements FileHandle {
    readonly type: DescriptorType;
    #fd: number;
    // One hold for the descriptor and one for each stream.
    #holds = 1;

    /**
     * @param fd - the open file descriptor, owned by this object from now on
     * @param type - what the file was when it was opened
     */
    constructor(fd: number, type: DescriptorType) {
        this.#fd = fd;
        this.type = type;
    }

    /**
     * The file descriptor, for as long as the file is open.
     *
     * A closed descriptor number may already name another file, so it must
     * never reach `fs` again.
     *
     * @returns the open file descriptor
     */
    fd(): number {
        if (this.#holds === 0) {
            const error: NodeJS.ErrnoException = new Error("file is closed");
            error.code = "EBADF";
            throw error;
        }
        return this.#fd;
    }

    /** Keep the file open on behalf of a stream. */
    retain() {
        this.fd();
        this.#holds++;
    }

    close() {
        const fd = this.fd();
        if (--this.#holds === 0) {
            closeSync(fd);
        }
    }

    stat() {
        return toFileStats(fstatSync(this.fd(), { bigint: true }));
    }

    metadataHash() {
        return toMetadataHash(fstatSync(this.fd(), { bigint: true }));
    }

    read(length: number, offset: number) {
        const fd = this.fd();
        if (length > UNCHECKED_READ_LENGTH) {
            length = boundedReadLength(length, offset, fstatSync(fd));
        }
        const buffer = new Uint8Array(length);
        const bytesRead = waitingOut(() => readSync(fd, buffer, 0, length, offset));
        return {
            bytes: bytesRead === length ? buffer : buffer.subarray(0, bytesRead),
            eof: bytesRead === 0,
        };
    }

    write(buffer: Uint8Array, offset: number) {
        const fd = this.fd();
        return waitingOut(() => writeSync(fd, buffer, 0, buffer.byteLength, offset));
    }

    setSize(size: number) {
        ftruncateSync(this.fd(), size);
    }

    setTimes(atime: number, mtime: number) {
        futimesSync(this.fd(), atime, mtime);
    }

    sync() {
        fsyncSync(this.fd());
    }

    syncData() {
        fdatasyncSync(this.fd());
    }

    advise(offset: bigint, length: bigint, advice: Advice) {
        fadvise(this.fd(), offset, length, advice);
    }

    readViaStream(offset: bigint) {
        return MainThreadFileInputStream.create(this, offset);
    }

    writeViaStream(offset: bigint) {
        return MainThreadFileOutputStream.create(this, offset);
    }
}

/**
 * The state of a file stream, apart from the stream object: the finalizer of
 * a stream that was never dropped runs after the object is gone.
 */
class FileStreamState implements ReadyPollableOwner {
    pollables = 0;
    /** The Node.js error of the operation that failed, reported by every later call. */
    failure: Error | undefined;
    /** Set once a read reaches the end of the file. */
    ended = false;
    readonly file: MainThreadFile;
    /** Where in the file the next read or write takes place. */
    position: number;
    #finalizer: (() => void) | null = null;

    /**
     * @param file - the file, retained until the stream is dropped
     * @param offset - where in the file the stream starts
     * @param stream - the stream object, dropped by the garbage collector as a last resort
     * @param debugName - how to name the stream if it is dropped before its pollables
     */
    constructor(file: MainThreadFile, offset: bigint, stream: object, debugName: string) {
        this.position = Number(offset);
        // The streams of the I/O worker refuse the same offsets, with the same error.
        if (!Number.isSafeInteger(this.position)) {
            throw Object.assign(
                new RangeError(
                    `The value of "start" is out of range. It must be >= 0 && <= ${Number.MAX_SAFE_INTEGER}. Received ${offset}`,
                ),
                { code: "ERR_OUT_OF_RANGE" },
            );
        }
        file.retain();
        this.file = file;
        this.#finalizer = registerDispose(stream, null, 0, () => {
            verifyReadyPollablesDropped(this, debugName);
            file.close();
        });
    }

    /** Drop the stream now rather than when it is collected. */
    dispose() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }

    /** Throw the stream error that the stream is stuck in, if any. */
    check() {
        if (this.failure) {
            throw lastOperationFailed(this.failure);
        }
    }

    /**
     * Record a failed operation and build the stream error for it.
     *
     * @param error - what `fs` threw
     * @returns the stream error to throw
     */
    fail(error: unknown) {
        const { code, message, stack } = error as NodeJS.ErrnoException;
        this.failure = Object.assign(new Error(message), { code, message, stack });
        return lastOperationFailed(this.failure);
    }

    /**
     * Read up to `len` bytes at the stream position and advance it.
     *
     * @param len - the most bytes to read
     * @param blocking - whether to wait for a file that has no bytes yet (see `waitingOut`)
     * @returns the bytes read; empty only for a `len` of zero or a read that did not wait
     */
    read(len: bigint | number, blocking: boolean): Uint8Array {
        this.check();
        if (this.ended) {
            throw { tag: "closed" };
        }

        const length = Math.min(Number(len), STREAM_CHUNK);
        if (length === 0) {
            return new Uint8Array(0);
        }

        const buffer = new Uint8Array(length);
        let bytesRead: number;
        try {
            const fd = this.file.fd();
            const read = () => readSync(fd, buffer, 0, length, this.position);
            bytesRead = blocking ? waitingOut(read) : read();
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EAGAIN") {
                return new Uint8Array(0);
            }
            throw this.fail(error);
        }
        if (bytesRead === 0) {
            this.ended = true;
            throw { tag: "closed" };
        }
        this.position += bytesRead;
        return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
    }

    /**
     * Write all of `buffer` at the stream position and advance it.
     *
     * @param buffer - the bytes to write
     */
    write(buffer: Uint8Array) {
        this.check();
        try {
            const fd = this.file.fd();
            let written = 0;
            while (written < buffer.byteLength) {
                written += waitingOut(() =>
                    writeSync(
                        fd,
                        buffer,
                        written,
                        buffer.byteLength - written,
                        this.position + written,
                    ),
                );
            }
        } catch (error) {
            throw this.fail(error);
        }
        this.position += buffer.byteLength;
    }
}

/** The `input-stream` of a file opened on the main thread. Always ready. */
class MainThreadFileInputStream extends streams.InputStream {
    #state!: FileStreamState;

    /**
     * @param file - the file to read
     * @param offset - where to start reading
     * @returns the stream
     */
    static create(file: MainThreadFile, offset: bigint) {
        const stream = new MainThreadFileInputStream();
        stream.#state = new FileStreamState(file, offset, stream, "input stream");
        return stream;
    }

    read(len: bigint) {
        return this.#state.read(len, false);
    }

    blockingRead(len: bigint) {
        return this.#state.read(len, true);
    }

    skip(len: bigint) {
        return BigInt(this.#state.read(len, false).byteLength);
    }

    blockingSkip(len: bigint) {
        return BigInt(this.#state.read(len, true).byteLength);
    }

    subscribe() {
        return readyPollableCreate(this.#state, this);
    }

    [symbolDispose]() {
        this.#state.dispose();
    }
}

/**
 * The `output-stream` of a file opened on the main thread.
 *
 * Every write reaches the file before the call returns, so the stream is
 * always ready and a flush has nothing left to wait for.
 */
class MainThreadFileOutputStream extends streams.OutputStream {
    #state!: FileStreamState;

    /**
     * @param file - the file to write
     * @param offset - where to start writing
     * @returns the stream
     */
    static create(file: MainThreadFile, offset: bigint) {
        const stream = new MainThreadFileOutputStream();
        stream.#state = new FileStreamState(file, offset, stream, "output stream");
        return stream;
    }

    checkWrite() {
        this.#state.check();
        return BigInt(STREAM_CHUNK);
    }

    write(buffer: Uint8Array) {
        if (buffer.byteLength > STREAM_CHUNK) {
            streamTrap(new Error("wasi-io trap: attempt to write too many bytes"));
        }
        this.#state.write(buffer);
    }

    blockingWriteAndFlush(buffer: Uint8Array) {
        this.#state.write(buffer);
    }

    flush() {
        this.#state.check();
    }

    blockingFlush() {
        this.#state.check();
    }

    writeZeroes(len: bigint) {
        if (len > BigInt(STREAM_CHUNK)) {
            streamTrap(new Error("wasi-io trap: attempt to write too many bytes"));
        }
        this.#state.write(new Uint8Array(Number(len)));
    }

    blockingWriteZeroesAndFlush(len: bigint) {
        const zeroes = new Uint8Array(Math.min(Number(len), STREAM_CHUNK));
        for (let remaining = Number(len); remaining > 0; remaining -= zeroes.byteLength) {
            this.#state.write(
                remaining < zeroes.byteLength ? zeroes.subarray(0, remaining) : zeroes,
            );
        }
    }

    splice(src: InstanceType<typeof streams.InputStream>, len: bigint) {
        return hostSplice(this, src, len, false);
    }

    blockingSplice(src: InstanceType<typeof streams.InputStream>, len: bigint) {
        return hostSplice(this, src, len, true);
    }

    subscribe() {
        return readyPollableCreate(this.#state, this);
    }

    [symbolDispose]() {
        this.#state.dispose();
    }
}

/**
 * Open a host file on the main thread if its operations complete within the call.
 *
 * Opening a FIFO waits for its other end like a read does, so the type is
 * read before the file is opened rather than after.
 *
 * @param path - the resolved host path
 * @param flags - `fs.constants.O_*` open flags
 * @returns the open file, or undefined when the I/O worker has to open it
 */
export function openMainThreadFile(path: string, flags: number): FileHandle | undefined {
    let stats;
    try {
        stats = (flags & constants.O_NOFOLLOW ? lstatSync : statSync)(path);
    } catch (error) {
        // A missing file that the open creates is created as a regular file.
        // Any other failure is the one the open would report.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !(flags & constants.O_CREAT)) {
            throw error;
        }
    }
    if (stats && !completesWithinCall(lookupType(stats))) {
        return undefined;
    }

    // The path may have been replaced since it was read. O_NONBLOCK keeps
    // the open of a FIFO that appeared in the meantime from waiting, and the
    // type of what was actually opened decides. The flag stays on the open
    // file; `waitingOut` deals with the few regular files it means anything to.
    const fd = openSync(path, flags | O_NONBLOCK);
    let type: DescriptorType;
    try {
        type = lookupType(fstatSync(fd));
    } catch (error) {
        closeSync(fd);
        throw error;
    }
    if (!completesWithinCall(type)) {
        closeSync(fd);
        return undefined;
    }
    return new MainThreadFile(fd, type);
}
