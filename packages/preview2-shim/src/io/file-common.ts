/**
 * What the I/O worker and the main thread both need to operate on a host
 * file. The module depends on neither, so that each can load it.
 */
import type { Advice, fadvise as Fadvise } from "@bytecodealliance/jco-node-fs";
import { createRequire } from "node:module";

import type { DescriptorType } from "../../types/interfaces/wasi-filesystem-types.js";

/** Reads up to this length are attempted as requested, without a look at the file. */
export const UNCHECKED_READ_LENGTH = 64 * 1024;

/** The most one read returns. A guest that wants more reads again. */
export const MAX_READ_LENGTH = 2 ** 30;

/**
 * Bound the length of a large read by what the file can supply.
 *
 * A guest may ask for any u64 number of bytes, for example to read "the rest"
 * of a file, and the buffer for the answer is allocated before the read. The
 * answer may be shorter than the request, so the buffer only has to hold what
 * a regular file has left after the offset. Files that report no size, such as
 * devices and some virtual files, get the unchecked length.
 *
 * @param length - the requested length
 * @param offset - the offset the read starts at
 * @param stats - the file, as `fstat` describes it
 * @returns a length of at least one unchecked read and at most the request
 */
export function boundedReadLength(
    length: number,
    offset: number,
    stats: { isFile(): boolean; size: number | bigint },
): number {
    const remaining = stats.isFile() ? Number(stats.size) - offset : 0;
    return Math.min(length, MAX_READ_LENGTH, Math.max(remaining, UNCHECKED_READ_LENGTH));
}

/** The type predicates shared by `fs.Stats`, `fs.BigIntStats` and `fs.Dirent`. */
interface FileTypePredicates {
    isFile(): boolean;
    isSocket(): boolean;
    isSymbolicLink(): boolean;
    isFIFO(): boolean;
    isDirectory(): boolean;
    isCharacterDevice(): boolean;
    isBlockDevice(): boolean;
}

/**
 * Map what Node.js reports about a file to its WASI descriptor type.
 *
 * @param obj - stats or a directory entry
 * @returns the descriptor type
 */
export function lookupType(obj: FileTypePredicates): DescriptorType {
    if (obj.isFile()) {
        return "regular-file";
    } else if (obj.isSocket()) {
        return "socket";
    } else if (obj.isSymbolicLink()) {
        return "symbolic-link";
    } else if (obj.isFIFO()) {
        return "fifo";
    } else if (obj.isDirectory()) {
        return "directory";
    } else if (obj.isCharacterDevice()) {
        return "character-device";
    } else if (obj.isBlockDevice()) {
        return "block-device";
    }
    return "unknown";
}

/**
 * The part of `fs.BigIntStats` read here. Declared structurally, because the
 * declarations of this module are reachable from the package's public types,
 * which must not need the Node.js type definitions.
 */
interface BigIntStats extends FileTypePredicates {
    nlink: bigint;
    size: bigint;
    ino: bigint;
    atimeNs: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
}

/** The fields of `fs.BigIntStats` that a descriptor reports. */
export interface FileStats {
    type: DescriptorType;
    nlink: bigint;
    size: bigint;
    atimeNs: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
}

/**
 * @param stats - the file, as `fstat` describes it
 * @returns the fields a descriptor reports
 */
export function toFileStats(stats: BigIntStats): FileStats {
    return {
        type: lookupType(stats),
        nlink: stats.nlink,
        size: stats.size,
        atimeNs: stats.atimeNs,
        mtimeNs: stats.mtimeNs,
        ctimeNs: stats.ctimeNs,
    };
}

/**
 * @param stats - the file, as `fstat` describes it
 * @returns the `metadata-hash-value` of the file
 */
export function toMetadataHash(stats: BigIntStats): { upper: bigint; lower: bigint } {
    return { upper: stats.mtimeNs, lower: stats.ino };
}

let nativeFadvise: typeof Fadvise | undefined;

/**
 * Advise the system about the use of a file range. The native module behind
 * it is loaded when a guest first gives advice.
 *
 * @param fd - the open file descriptor
 * @param offset - where the range starts
 * @param length - the length of the range
 * @param advice - the advice
 */
export function fadvise(fd: number, offset: bigint, length: bigint, advice: Advice): void {
    nativeFadvise ??= createRequire(import.meta.url)("@bytecodealliance/jco-node-fs")
        .fadvise as typeof Fadvise;
    nativeFadvise(fd, offset, length, advice);
}
