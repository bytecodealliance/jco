import { WasiResource } from "../common/resource.js";
import { Worker } from "node:worker_threads";
import { createSyncFn } from "../synckit/index.js";
import {
    CALL_MASK,
    CALL_TYPE_MASK,
    FILE,
    HTTP_SERVER_INCOMING_HANDLER,
    HTTP,
    INPUT_STREAM_BLOCKING_READ,
    INPUT_STREAM_BLOCKING_SKIP,
    INPUT_STREAM_DISPOSE,
    INPUT_STREAM_READ,
    INPUT_STREAM_SKIP,
    INPUT_STREAM_SUBSCRIBE,
    OUTPUT_STREAM_BLOCKING_FLUSH,
    OUTPUT_STREAM_BLOCKING_SPLICE,
    OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH,
    OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH,
    OUTPUT_STREAM_CHECK_WRITE,
    OUTPUT_STREAM_DISPOSE,
    OUTPUT_STREAM_FLUSH,
    OUTPUT_STREAM_SPLICE,
    OUTPUT_STREAM_SUBSCRIBE,
    OUTPUT_STREAM_WRITE_ZEROES,
    OUTPUT_STREAM_WRITE,
    POLL_POLL_LIST,
    POLL_POLL_LIST_READY,
    POLL_POLLABLE_BLOCK,
    POLL_POLLABLE_DISPOSE,
    POLL_POLLABLE_READY,
    SOCKET_TCP,
    STDERR,
    STDIN,
    STDOUT,
    reverseMap,
} from "./calls.js";
import {
    createReadyPollableRep,
    disposeReadyPollableRep,
    isReadyPollableRep,
    type ReadyPollableOwner,
} from "./ready-pollables.js";
import nodeProcess, { exit, stderr, stdout, env } from "node:process";

import type { streams as StreamsNamespace } from "../../types/io.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

type IInputStream = StreamsNamespace.InputStream;
type IOutputStream = StreamsNamespace.OutputStream;

const _rawDebug =
    "_rawDebug" in nodeProcess
        ? (nodeProcess._rawDebug as (...args: unknown[]) => void)
        : console.error.bind(console);

const httpIncomingHandlers = new Map();
export function registerIncomingHttpHandler(id, handler) {
    httpIncomingHandlers.set(id, handler);
}

const instanceId = Math.round(Math.random() * 1000).toString();
const DEBUG_DEFAULT = false;
const DEBUG =
    env.PREVIEW2_SHIM_DEBUG === "0"
        ? false
        : env.PREVIEW2_SHIM_DEBUG === "1"
          ? true
          : DEBUG_DEFAULT;

/**
 * @type {(call: number, id: number | null, payload: any) -> any}
 */
export let ioCall = createSyncFn(
    (options) => new Worker(new URL("./worker-thread.bundle.js", import.meta.url), options),
    DEBUG,
    (type, id, payload) => {
        // 'callbacks' from the worker
        // ONLY happens for an http server incoming handler, and NOTHING else (not even sockets, since accept is sync!)
        if (type !== HTTP_SERVER_INCOMING_HANDLER) {
            throw new Error("Internal error: only incoming handler callback is permitted");
        }
        const handler = httpIncomingHandlers.get(id);
        if (!handler) {
            throw new Error(`Internal error: no incoming handler registered for server ${id}`);
        }
        handler(payload);
    },
);
if (DEBUG) {
    const _ioCall = ioCall;
    ioCall = function ioCall(num, id, payload) {
        if (typeof id !== "number" && id !== null) {
            throw new Error("id must be a number or null");
        }
        let ret;
        try {
            _rawDebug(
                instanceId,
                reverseMap[num & CALL_MASK],
                reverseMap[num & CALL_TYPE_MASK],
                id,
                payload,
            );
            ret = _ioCall(num, id, payload);
            return ret;
        } catch (e) {
            ret = e;
            throw ret;
        } finally {
            _rawDebug(instanceId, "->", ret);
        }
    };
}

const finalizationRegistry = new FinalizationRegistry((dispose: any) => void dispose());

const dummySymbol = Symbol();

export function registerDispose(
    resource: any,
    parentResource: any,
    id: number,
    disposeFn: (id: number) => void,
) {
    // While strictly speaking all components should handle their disposal,
    // this acts as a last-resort to catch all missed drops through the JS GC.
    // Mainly for two cases - (1) components which are long lived, that get shut
    // down and (2) users that interface with low-level WASI APIs directly in JS
    // for various reasons may end up leaning on JS GC inadvertantly.
    function finalizer() {
        // This has no functional purpose other than to pin a strong reference
        // from the child resource's finalizer to the parent resource, to ensure
        // that we can never finalize a parent resource before a child resource.
        // This makes the generational JS GC become piecewise over child resource
        // graphs (generational at each resource hierarchy level at least).
        if (parentResource?.[dummySymbol]) {
            return;
        }
        disposeFn(id);
    }
    finalizationRegistry.register(resource, finalizer, finalizer);
    return finalizer;
}

export function earlyDispose(finalizer) {
    finalizationRegistry.unregister(finalizer);
    finalizer();
}

class IoError extends WasiResource {
    readonly message: string;
    constructor(readonly payload: Error | string) {
        super();
        this.message = String(payload);
    }
    toDebugString() {
        return this.message;
    }
}

/**
 * Build the `last-operation-failed` stream error for a failed Node.js operation.
 *
 * The error resource carries the Node.js error code, message and stack, which
 * is what `filesystem-error-code` later maps to a WASI error code.
 *
 * @param error - the Node.js error, or the fields of one posted by the I/O worker
 * @returns the value to throw from a stream method
 */
export function lastOperationFailed(error: { message: string }) {
    return {
        tag: "last-operation-failed",
        val: new IoError(Object.assign(new Error(error.message), error)),
    };
}

/**
 * Report a stream operation that the guest was not allowed to make, and exit.
 *
 * @param error - what went wrong
 */
export function streamTrap(error: unknown): never {
    console.trace(error);
    exit(1);
}

function streamIoErrorCall(call, id, payload) {
    try {
        return ioCall(call, id, payload);
    } catch (e: any) {
        if (e.tag === "closed") {
            throw e;
        }
        if (e.tag === "last-operation-failed") {
            e.val = lastOperationFailed(e.val).val;
            throw e;
        }
        // any invalid error is a trap
        streamTrap(e);
    }
}

/**
 * Most bytes a file stream on the main thread reads or accepts in one call,
 * and most bytes moved by one splice that passes through the main thread. It
 * matches the buffer size of the worker's file streams.
 */
export const STREAM_CHUNK = 64 * 1024;

/**
 * Splice between two streams that are not both served by the I/O worker, by
 * reading from one and writing to the other through their own methods.
 *
 * @param output - the stream to write to
 * @param input - the stream to read from
 * @param len - the most bytes to move
 * @param blocking - whether to wait for input and for the write to complete
 * @returns the number of bytes moved
 */
export function hostSplice(
    output: IOutputStream,
    input: IInputStream,
    len: bigint,
    blocking: boolean,
): bigint {
    let limit = BigInt(len);
    if (limit > BigInt(STREAM_CHUNK)) {
        limit = BigInt(STREAM_CHUNK);
    }

    if (blocking) {
        const bytes = input.blockingRead(limit);
        output.blockingWriteAndFlush(bytes);
        return BigInt(bytes.byteLength);
    }

    // Never read more than the output accepts: bytes taken from the input
    // cannot be put back.
    const permit = output.checkWrite();
    if (permit < limit) {
        limit = permit;
    }
    if (limit === 0n) {
        return 0n;
    }
    const bytes = input.read(limit);
    if (bytes.byteLength > 0) {
        output.write(bytes);
    }
    return BigInt(bytes.byteLength);
}

class InputStream extends WasiResource implements IInputStream {
    #id;
    #streamType;
    #finalizer;
    read(len) {
        return streamIoErrorCall(INPUT_STREAM_READ | this.#streamType, this.#id, len);
    }
    blockingRead(len) {
        return streamIoErrorCall(INPUT_STREAM_BLOCKING_READ | this.#streamType, this.#id, len);
    }
    skip(len) {
        return streamIoErrorCall(INPUT_STREAM_SKIP | this.#streamType, this.#id, len);
    }
    blockingSkip(len) {
        return streamIoErrorCall(INPUT_STREAM_BLOCKING_SKIP | this.#streamType, this.#id, len);
    }
    subscribe() {
        return pollableCreate(ioCall(INPUT_STREAM_SUBSCRIBE | this.#streamType, this.#id), this);
    }
    static _id(stream) {
        return stream.#id;
    }
    /**
     * @param {FILE | SOCKET_TCP | STDIN | HTTP} streamType
     */
    static _create(streamType, id) {
        const stream = new InputStream();
        stream.#id = id;
        stream.#streamType = streamType;
        let disposeFn;
        switch (streamType) {
            case FILE:
                disposeFn = fileInputStreamDispose;
                break;
            case SOCKET_TCP:
                disposeFn = socketTcpInputStreamDispose;
                break;
            case STDIN:
                disposeFn = stdinInputStreamDispose;
                break;
            case HTTP:
                disposeFn = httpInputStreamDispose;
                break;
            default:
                throw new Error(
                    "wasi-io trap: Dispose function not created for stream type " +
                        reverseMap[streamType],
                );
        }
        stream.#finalizer = registerDispose(stream, null, id, disposeFn);
        return stream;
    }
    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}

function fileInputStreamDispose(id) {
    ioCall(INPUT_STREAM_DISPOSE | FILE, id, null);
}

function socketTcpInputStreamDispose(id) {
    ioCall(INPUT_STREAM_DISPOSE | SOCKET_TCP, id, null);
}

function stdinInputStreamDispose(id) {
    ioCall(INPUT_STREAM_DISPOSE | STDIN, id, null);
}

function httpInputStreamDispose(id) {
    ioCall(INPUT_STREAM_DISPOSE | HTTP, id, null);
}

export const inputStreamCreate = InputStream._create;
// @ts-expect-error - Deleting static method
delete InputStream._create;

export const inputStreamId = InputStream._id;
// @ts-expect-error - Deleting static method
delete InputStream._id;

class OutputStream extends WasiResource implements IOutputStream {
    #id;
    #streamType;
    #finalizer;
    checkWrite() {
        return streamIoErrorCall(OUTPUT_STREAM_CHECK_WRITE | this.#streamType, this.#id, null);
    }
    write(buf) {
        if (this.#streamType <= STDERR) {
            return this.blockingWriteAndFlush(buf);
        }
        return streamIoErrorCall(OUTPUT_STREAM_WRITE | this.#streamType, this.#id, buf);
    }
    blockingWriteAndFlush(buf) {
        if (this.#streamType <= STDERR) {
            const stream = this.#streamType === STDERR ? stderr : stdout;
            return void stream.write(buf);
        }
        return streamIoErrorCall(
            OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH | this.#streamType,
            this.#id,
            buf,
        );
    }
    flush() {
        return streamIoErrorCall(OUTPUT_STREAM_FLUSH | this.#streamType, this.#id, undefined);
    }
    blockingFlush() {
        return streamIoErrorCall(
            OUTPUT_STREAM_BLOCKING_FLUSH | this.#streamType,
            this.#id,
            undefined,
        );
    }
    writeZeroes(len) {
        return streamIoErrorCall(OUTPUT_STREAM_WRITE_ZEROES | this.#streamType, this.#id, len);
    }
    blockingWriteZeroesAndFlush(len) {
        return streamIoErrorCall(
            OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH | this.#streamType,
            this.#id,
            len,
        );
    }
    splice(src, len) {
        // Only a stream of the I/O worker has an id there to splice from.
        const srcId = inputStreamId(src);
        if (srcId === undefined) {
            return hostSplice(this, src, len, false);
        }
        return streamIoErrorCall(OUTPUT_STREAM_SPLICE | this.#streamType, this.#id, {
            src: srcId,
            len,
        });
    }
    blockingSplice(src, len) {
        const srcId = inputStreamId(src);
        if (srcId === undefined) {
            return hostSplice(this, src, len, true);
        }
        return streamIoErrorCall(OUTPUT_STREAM_BLOCKING_SPLICE | this.#streamType, this.#id, {
            src: srcId,
            len,
        });
    }
    subscribe() {
        return pollableCreate(
            ioCall(OUTPUT_STREAM_SUBSCRIBE | this.#streamType, this.#id),
            undefined,
        );
    }

    static _id(outputStream) {
        return outputStream.#id;
    }
    /**
     * @param {OutputStreamType} streamType
     * @param {any} createPayload
     */
    static _create(streamType, id) {
        const stream = new OutputStream();
        stream.#id = id;
        stream.#streamType = streamType;
        let disposeFn;
        switch (streamType) {
            case STDOUT:
                disposeFn = stdoutOutputStreamDispose;
                break;
            case STDERR:
                disposeFn = stderrOutputStreamDispose;
                break;
            case SOCKET_TCP:
                disposeFn = socketTcpOutputStreamDispose;
                break;
            case FILE:
                disposeFn = fileOutputStreamDispose;
                break;
            case HTTP:
                return stream;
            default:
                throw new Error(
                    "wasi-io trap: Dispose function not created for stream type " +
                        reverseMap[streamType],
                );
        }
        stream.#finalizer = registerDispose(stream, null, id, disposeFn);
        return stream;
    }

    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}

function stdoutOutputStreamDispose(id) {
    ioCall(OUTPUT_STREAM_DISPOSE | STDOUT, id);
}

function stderrOutputStreamDispose(id) {
    ioCall(OUTPUT_STREAM_DISPOSE | STDERR, id);
}

function socketTcpOutputStreamDispose(id) {
    ioCall(OUTPUT_STREAM_DISPOSE | SOCKET_TCP, id);
}

function fileOutputStreamDispose(id) {
    ioCall(OUTPUT_STREAM_DISPOSE | FILE, id);
}

export const outputStreamCreate = OutputStream._create;
// @ts-expect-error - Deleting static method
delete OutputStream._create;

export const outputStreamId = OutputStream._id;
// @ts-expect-error - Deleting static method
delete OutputStream._id;

export const error = { Error: IoError };

export const streams = { InputStream, OutputStream };

// A pollable is either served by the I/O worker or ready for good (see
// ready-pollables.ts). The two are told apart by rep alone, because bindings
// that lower pollables themselves pass nothing else.

function pollableReady(rep: number): boolean {
    return isReadyPollableRep(rep) || ioCall(POLL_POLLABLE_READY, rep);
}

function pollableBlock(rep: number): void {
    if (!isReadyPollableRep(rep)) {
        ioCall(POLL_POLLABLE_BLOCK, rep);
    }
}

function pollableDispose(rep: number): void {
    if (isReadyPollableRep(rep)) {
        disposeReadyPollableRep(rep);
    } else {
        ioCall(POLL_POLLABLE_DISPOSE, rep);
    }
}

/**
 * Wait until at least one pollable of a list is ready.
 *
 * A list that holds a ready pollable never waits. The I/O worker is still
 * asked, without waiting, which of its own pollables are ready, so that a
 * guest polling a file beside a socket or a timer keeps hearing about them.
 *
 * @param reps - the reps of the pollables, in list order
 * @returns the indices of the pollables that are ready, in ascending order
 */
function pollList(reps: number[]): Uint32Array {
    const workerReps: number[] = [];
    const workerIndices: number[] = [];
    for (let index = 0; index < reps.length; index++) {
        if (!isReadyPollableRep(reps[index])) {
            workerReps.push(reps[index]);
            workerIndices.push(index);
        }
    }
    // No ready pollable in the list: let the worker wait, in one call as before.
    if (workerReps.length === reps.length) {
        return ioCall(POLL_POLL_LIST, null, reps);
    }

    // The worker answers with indices into the list it was given, ascending.
    const workerReady: ArrayLike<number> =
        workerReps.length > 0 ? ioCall(POLL_POLL_LIST_READY, null, workerReps) : [];
    const ready = new Uint32Array(reps.length - workerReps.length + workerReady.length);
    let readyCount = 0;
    let nextWorkerReady = 0;
    for (let index = 0; index < reps.length; index++) {
        if (isReadyPollableRep(reps[index])) {
            ready[readyCount++] = index;
        } else if (workerIndices[workerReady[nextWorkerReady]] === index) {
            ready[readyCount++] = index;
            nextWorkerReady++;
        }
    }
    return ready;
}

const rep = Symbol.for("cabiRep");

/**
 * The rep that bindings and the I/O worker know a pollable by.
 *
 * @param pollable - a pollable
 * @returns its rep
 */
function repOf(pollable: Pollable): number {
    return (pollable as unknown as Record<symbol, number>)[rep];
}

class Pollable extends WasiResource {
    #finalizer;
    ready() {
        return pollableReady(repOf(this));
    }
    block() {
        pollableBlock(repOf(this));
    }
    static _create(id, parent) {
        const pollable = new Pollable();
        pollable[rep] = id;
        pollable.#finalizer = registerDispose(pollable, parent, id, pollableDispose);
        return pollable;
    }
    [symbolDispose]() {
        if (this.#finalizer && this[rep]) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}

const cabiLowerSymbol = Symbol.for("cabiLower");
const T_FLAG = 1 << 30;

Pollable.prototype.ready[cabiLowerSymbol] = function ({ resourceTables: [table] }) {
    return function loweredPollableReady(handle) {
        const rep = table[(handle << 1) + 1] & ~T_FLAG;
        return pollableReady(rep) ? 1 : 0;
    };
};

Pollable.prototype.block[cabiLowerSymbol] = function ({ resourceTables: [table] }) {
    return function loweredPollableBlock(handle) {
        const rep = table[(handle << 1) + 1] & ~T_FLAG;
        pollableBlock(rep);
    };
};

Pollable[Symbol.for("cabiDispose")] = pollableDispose;

export const pollableCreate = Pollable._create;
// @ts-expect-error - Deleting static method
delete Pollable._create;

/**
 * Create a pollable that is ready for as long as it exists.
 *
 * @param owner - state of the resource subscribed to, which counts its live pollables
 * @param parent - the resource subscribed to
 * @returns the pollable
 */
export function readyPollableCreate(owner: ReadyPollableOwner, parent: object) {
    return pollableCreate(createReadyPollableRep(owner), parent);
}

export const poll = {
    Pollable,
    poll(list) {
        return pollList(list.map(repOf));
    },
};

poll.poll[cabiLowerSymbol] = function ({ memory, realloc, resourceTables: [table] }) {
    return function pollPollList(listPtr, len, retptr) {
        const handleList = new Uint32Array(memory.buffer, listPtr, len);
        const repList = Array(len);
        for (let i = 0; i < len; i++) {
            const handle = handleList[i];
            repList[i] = table[(handle << 1) + 1] & ~T_FLAG;
        }
        const result = pollList(repList);
        const ptr = realloc(0, 0, 4, result.byteLength);
        const out = new Uint32Array(memory.buffer, ptr, result.length);
        out.set(result);
        const ret = new Uint32Array(memory.buffer, retptr, 2);
        ret[0] = ptr;
        ret[1] = result.length;
        return retptr;
    };
};

export function createPoll(call, id, initPayload) {
    return pollableCreate(ioCall(call, id, initPayload), undefined);
}

export function createPollLower(call, id, table) {
    return function (initPayload) {
        const rep = ioCall(call, id, initPayload);
        const free = table[0] & ~T_FLAG;
        if (free === 0) {
            table.push(0);
            table.push(rep | T_FLAG);
            return (table.length >> 1) - 1;
        }
        table[0] = table[free << 1];
        table[free << 1] = 0;
        table[(free << 1) + 1] = rep | T_FLAG;
        return free;
    };
}
