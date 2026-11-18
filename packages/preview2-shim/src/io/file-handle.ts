import type { Advice } from "@bytecodealliance/jco-node-fs";
import type { FileStats } from "./file-common.js";
import type { DescriptorType } from "../../types/interfaces/wasi-filesystem-types.js";
import type { streams as StreamsNamespace } from "../../types/io.js";
import {
    FILE,
    FILESYSTEM_DESCRIPTOR_ADVISE,
    FILESYSTEM_DESCRIPTOR_CLOSE,
    FILESYSTEM_DESCRIPTOR_METADATA_HASH,
    FILESYSTEM_DESCRIPTOR_OPEN,
    FILESYSTEM_DESCRIPTOR_READ,
    FILESYSTEM_DESCRIPTOR_SET_SIZE,
    FILESYSTEM_DESCRIPTOR_SET_TIMES,
    FILESYSTEM_DESCRIPTOR_STAT,
    FILESYSTEM_DESCRIPTOR_SYNC,
    FILESYSTEM_DESCRIPTOR_SYNC_DATA,
    FILESYSTEM_DESCRIPTOR_WRITE,
    INPUT_STREAM_CREATE,
    OUTPUT_STREAM_CREATE,
} from "./calls.js";
import { inputStreamCreate, ioCall, outputStreamCreate } from "./worker-io.js";

/**
 * An open host file behind a `wasi:filesystem` descriptor.
 *
 * The descriptor decides what is permitted and maps errors to WASI error
 * codes. An implementation only performs the operation, and reports a failure
 * by throwing the Node.js error with its `code`.
 */
export interface FileHandle {
    /** What the file is. The type of an open file does not change. */
    readonly type: DescriptorType;

    /** Give up the descriptor's hold. The file closes once its streams are dropped too. */
    close(): void;
    stat(): FileStats;
    metadataHash(): { upper: bigint; lower: bigint };
    read(length: number, offset: number): { bytes: Uint8Array; eof: boolean };
    /** @returns the number of bytes written, which may be fewer than given */
    write(buffer: Uint8Array, offset: number): number;
    setSize(size: number): void;
    /** Set the access and modification times, in seconds. */
    setTimes(atime: number, mtime: number): void;
    sync(): void;
    syncData(): void;
    advise(offset: bigint, length: bigint, advice: Advice): void;
    readViaStream(offset: bigint): StreamsNamespace.InputStream;
    writeViaStream(offset: bigint): StreamsNamespace.OutputStream;
}

/** A file opened and operated on by the I/O worker, one round trip per call. */
class WorkerFile implements FileHandle {
    readonly type: DescriptorType;
    #id: number;

    /**
     * @param id - the worker's id of the open file
     * @param type - what the file was when the worker opened it
     */
    constructor(id: number, type: DescriptorType) {
        this.#id = id;
        this.type = type;
    }

    close() {
        ioCall(FILESYSTEM_DESCRIPTOR_CLOSE, this.#id);
    }

    stat() {
        return ioCall(FILESYSTEM_DESCRIPTOR_STAT, this.#id);
    }

    metadataHash() {
        return ioCall(FILESYSTEM_DESCRIPTOR_METADATA_HASH, this.#id);
    }

    read(length: number, offset: number) {
        return ioCall(FILESYSTEM_DESCRIPTOR_READ, this.#id, { length, offset });
    }

    write(buffer: Uint8Array, offset: number) {
        return ioCall(FILESYSTEM_DESCRIPTOR_WRITE, this.#id, { buffer, offset });
    }

    setSize(size: number) {
        ioCall(FILESYSTEM_DESCRIPTOR_SET_SIZE, this.#id, size);
    }

    setTimes(atime: number, mtime: number) {
        ioCall(FILESYSTEM_DESCRIPTOR_SET_TIMES, this.#id, { atime, mtime });
    }

    sync() {
        ioCall(FILESYSTEM_DESCRIPTOR_SYNC, this.#id);
    }

    syncData() {
        ioCall(FILESYSTEM_DESCRIPTOR_SYNC_DATA, this.#id);
    }

    advise(offset: bigint, length: bigint, advice: Advice) {
        ioCall(FILESYSTEM_DESCRIPTOR_ADVISE, this.#id, { offset, length, advice });
    }

    readViaStream(offset: bigint) {
        return inputStreamCreate(
            FILE,
            ioCall(INPUT_STREAM_CREATE | FILE, null, { descriptorId: this.#id, offset }),
        );
    }

    writeViaStream(offset: bigint) {
        return outputStreamCreate(
            FILE,
            ioCall(OUTPUT_STREAM_CREATE | FILE, null, { descriptorId: this.#id, offset }),
        );
    }
}

/**
 * Open a host file in the I/O worker.
 *
 * @param path - the resolved host path
 * @param flags - `fs.constants.O_*` open flags
 * @returns the open file
 */
export function openWorkerFile(path: string, flags: number): FileHandle {
    const { id, type } = ioCall(FILESYSTEM_DESCRIPTOR_OPEN, null, { path, flags });
    return new WorkerFile(id, type);
}
