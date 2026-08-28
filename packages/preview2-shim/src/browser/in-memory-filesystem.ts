import { types as TypesNamespace } from "../../types/filesystem.js";
import {
    InputStream as IInputStream,
    OutputStream as IOutputStream,
} from "../../types/interfaces/wasi-io-streams.js";
import type {
    BrowserDirectoryEntryStream,
    BrowserFilesystemAdapter,
    BrowserFilesystemDescriptor,
} from "./filesystem.js";
import { _getCwd } from "./config.js";
import { inputStreamCreate, outputStreamCreate } from "./io.js";

type Filesize = TypesNamespace.Filesize;
type OpenFlags = TypesNamespace.OpenFlags;
type PathFlags = TypesNamespace.PathFlags;

export interface FileDataEntry {
    // Directory contents (present for directories)
    dir?: Record<string, FileDataEntry>;
    // File contents (present for files)
    source?: Uint8Array | string;
}

/**
 * Root file data structure representing a filesystem tree.
 * Each entry is either a directory (has `dir` property) or a file (has `source` property).
 * @example
 * // A simple filesystem with one directory containing one file:
 * const fileData = {
 *   dir: {
 *     'myfile.txt': { source: new Uint8Array([72, 101, 108, 108, 111]) }
 *   }
 * };
 */
export type FileData = FileDataEntry;

const rootEntries = new WeakSet<FileDataEntry>();

const timeZero = {
    seconds: 0n,
    nanoseconds: 0,
};

/** Coerce the given object to a safe integer */
function coerceToSafeIntegerNumber(obj: number | bigint): number {
    let n: number;
    if (typeof obj === "number") {
        n = obj;
    } else if (typeof obj == "bigint") {
        n = Number(obj);
    } else {
        throw new TypeError(`unexpected non-numeric type: ${obj}`);
    }
    if (n > Number.MAX_SAFE_INTEGER) {
        throw new TypeError(`excessively large number: ${n}`);
    }
    return n;
}

function getChildEntry(parentEntry: FileDataEntry, subpath: string): FileDataEntry {
    if (subpath === "." && rootEntries.has(parentEntry)) {
        subpath = _getCwd();
        if (subpath.startsWith("/") && subpath !== "/") {
            subpath = subpath.slice(1);
        }
    }
    let entry: FileDataEntry | undefined = parentEntry;
    let segmentIdx: number;
    do {
        if (!entry?.dir) {
            throw "not-directory";
        }
        segmentIdx = subpath.indexOf("/");
        const segment = segmentIdx === -1 ? subpath : subpath.slice(0, segmentIdx);
        if (segment === "..") {
            throw "no-entry";
        }
        if (segment === "." || segment === "") {
        } else {
            entry = entry.dir[segment];
            if (!entry) {
                throw "no-entry";
            }
        }
        subpath = subpath.slice(segmentIdx + 1);
    } while (segmentIdx !== -1);
    if (!entry) {
        throw "no-entry";
    }
    return entry;
}

function getParentEntry(root: FileDataEntry, path: string): [FileDataEntry, string] {
    const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".");
    if (segments.length === 0 || segments.some((segment) => segment === "..")) {
        throw "invalid";
    }
    const name = segments.pop()!;
    let parent = root;
    for (const segment of segments) {
        const child = parent.dir?.[segment];
        if (!child) {
            throw "no-entry";
        }
        if (!child.dir) {
            throw "not-directory";
        }
        parent = child;
    }
    if (!parent.dir) {
        throw "not-directory";
    }
    return [parent, name];
}

function getSource(fileEntry: FileDataEntry): Uint8Array {
    if (typeof fileEntry.source === "string") {
        fileEntry.source = new TextEncoder().encode(fileEntry.source);
    }
    return fileEntry.source!;
}

function containsEntry(root: FileDataEntry, target: FileDataEntry): boolean {
    if (root === target) {
        return true;
    }
    return root.dir ? Object.values(root.dir).some((entry) => containsEntry(entry, target)) : false;
}

// Keep spare capacity separate so FileDataEntry.source always reflects the logical file size.
const fileWriteBuffers = new WeakMap<FileDataEntry, Uint8Array>();

interface EntryMetadata {
    id: bigint;
    version: bigint;
    linkCount: bigint;
}

let nextEntryId = 0n;
const entryMetadata = new WeakMap<FileDataEntry, EntryMetadata>();

function metadata(entry: FileDataEntry): EntryMetadata {
    let value = entryMetadata.get(entry);
    if (!value) {
        value = { id: ++nextEntryId, version: 0n, linkCount: 1n };
        entryMetadata.set(entry, value);
    }
    return value;
}

function touch(entry: FileDataEntry): void {
    metadata(entry).version++;
}

function getFileWriteBuffer(
    entry: FileDataEntry,
    source: Uint8Array,
    requiredLength: number,
): Uint8Array {
    let buffer = fileWriteBuffers.get(entry);
    if (!buffer || buffer.buffer !== source.buffer || buffer.byteOffset !== source.byteOffset) {
        buffer = source;
    }
    if (requiredLength <= buffer.byteLength) {
        return buffer;
    }

    const newBuffer = new Uint8Array(Math.max(requiredLength, source.byteLength * 2));
    newBuffer.set(source);
    fileWriteBuffers.set(entry, newBuffer);
    return newBuffer;
}

class DirectoryEntryStream implements BrowserDirectoryEntryStream {
    idx = 0;
    entries: [string, FileDataEntry][] = [];

    static _create(entries: [string, FileDataEntry][]) {
        const stream = new DirectoryEntryStream();
        stream.entries = entries;
        return stream;
    }

    readDirectoryEntry() {
        if (this.idx === this.entries.length) {
            return undefined;
        }
        const [name, entry] = this.entries[this.idx];
        this.idx += 1;
        return {
            name,
            type: entry.dir ? "directory" : "regular-file",
        } as TypesNamespace.DirectoryEntry;
    }
}

const descriptorEntryStreamCreate = DirectoryEntryStream._create;
// @ts-expect-error - Deleting static method
delete DirectoryEntryStream._create;

class Descriptor implements BrowserFilesystemDescriptor {
    #stream: any;
    #entry!: FileDataEntry;
    #flags: TypesNamespace.DescriptorFlags = {
        read: true,
        write: true,
        mutateDirectory: true,
    };

    _getEntry(descriptor: Descriptor): FileDataEntry {
        return descriptor.#entry;
    }

    static _create(entry: FileDataEntry | any, isStream?: boolean) {
        const descriptor = new Descriptor();
        if (isStream) {
            descriptor.#stream = entry;
        } else {
            descriptor.#entry = entry;
        }
        return descriptor;
    }

    readViaStream(_offset: bigint) {
        const source = getSource(this.#entry);
        let offset = Number(_offset);
        return inputStreamCreate({
            blockingRead(len: bigint): Uint8Array {
                if (offset === source.byteLength) {
                    throw { tag: "closed" };
                }
                const bytes = source.slice(offset, offset + Number(len));
                offset += bytes.byteLength;
                return bytes;
            },
        }) as IInputStream;
    }

    writeViaStream(_offset: bigint) {
        const entry = this.#entry;
        let offset = coerceToSafeIntegerNumber(_offset);
        return outputStreamCreate({
            write(buf: Uint8Array): void {
                if (buf.byteLength === 0) {
                    return;
                }
                const source = getSource(entry);
                const end = offset + buf.byteLength;
                if (!Number.isSafeInteger(end)) {
                    throw new TypeError(`excessively large number: ${end}`);
                }
                const buffer = getFileWriteBuffer(entry, source, end);
                if (offset > source.byteLength) {
                    buffer.fill(0, source.byteLength, offset);
                }
                buffer.set(buf, offset);
                entry.source = buffer.subarray(0, Math.max(source.byteLength, end));
                offset = end;
                touch(entry);
            },
        }) as IOutputStream;
    }

    appendViaStream() {
        return this.writeViaStream(this.stat().size);
    }

    advise(_offset: Filesize, _length: Filesize, _advice: TypesNamespace.Advice) {
        if (this.getType() === "directory") {
            throw "bad-descriptor";
        }
    }

    syncData() {}

    getFlags() {
        return { ...this.#flags };
    }

    getType() {
        if (this.#stream) {
            return "fifo";
        }
        if (this.#entry.dir) {
            return "directory";
        }
        if (this.#entry.source) {
            return "regular-file";
        }
        return "unknown";
    }

    setSize(size: bigint) {
        if (this.getType() === "directory") {
            throw "is-directory";
        }
        const length = coerceToSafeIntegerNumber(size);
        const source = getSource(this.#entry);
        const resized = new Uint8Array(length);
        resized.set(source.subarray(0, length));
        this.#entry.source = resized;
        touch(this.#entry);
    }

    setTimes(dataAccessTimestamp: any, dataModificationTimestamp: any) {
        if (
            dataAccessTimestamp?.tag !== "no-change" ||
            dataModificationTimestamp?.tag !== "no-change"
        ) {
            touch(this.#entry);
        }
    }

    read(length: bigint, offset: bigint) {
        const source = getSource(this.#entry);
        const off = coerceToSafeIntegerNumber(offset);
        const len = coerceToSafeIntegerNumber(length);
        const result: [Uint8Array, boolean] = [
            source.slice(off, off + len),
            off + len >= source.byteLength,
        ];
        return result;
    }

    write(buffer: Uint8Array, offset: Filesize) {
        if (this.getType() === "directory") {
            throw "is-directory";
        }
        const off = coerceToSafeIntegerNumber(offset);
        const source = getSource(this.#entry);
        const end = off + buffer.byteLength;
        if (!Number.isSafeInteger(end)) {
            throw "file-too-large";
        }
        const target = new Uint8Array(Math.max(source.byteLength, end));
        target.set(source);
        target.set(buffer, off);
        this.#entry.source = target;
        touch(this.#entry);
        return BigInt(buffer.byteLength);
    }

    readDirectory() {
        if (!this.#entry?.dir) {
            throw "bad-descriptor";
        }
        return descriptorEntryStreamCreate(
            Object.entries(this.#entry.dir).sort(([a], [b]) => (a > b ? 1 : -1)),
        );
    }

    sync() {}

    createDirectoryAt(path: string) {
        try {
            getChildEntry(this.#entry, path);
            throw "exist";
        } catch (error) {
            if (error !== "no-entry") {
                throw error;
            }
        }
        const [parent, name] = getParentEntry(this.#entry, path);
        parent.dir![name] = { dir: {} };
        touch(parent);
    }

    stat() {
        let type: TypesNamespace.DescriptorType = "unknown";
        let size = 0n;
        if (this.#entry.source) {
            type = "regular-file";
            const source = getSource(this.#entry);
            size = BigInt(source.byteLength);
        } else if (this.#entry.dir) {
            type = "directory";
        }
        return {
            type,
            linkCount: metadata(this.#entry).linkCount,
            size,
            dataAccessTimestamp: timeZero,
            dataModificationTimestamp: timeZero,
            statusChangeTimestamp: timeZero,
        };
    }

    statAt(_pathFlags: PathFlags, path: string) {
        const entry = getChildEntry(this.#entry, path);
        let type: TypesNamespace.DescriptorType = "unknown";
        let size = 0n;
        if (entry.source) {
            type = "regular-file";
            const source = getSource(entry);
            size = BigInt(source.byteLength);
        } else if (entry.dir) {
            type = "directory";
        }
        return {
            type,
            linkCount: metadata(entry).linkCount,
            size,
            dataAccessTimestamp: timeZero,
            dataModificationTimestamp: timeZero,
            statusChangeTimestamp: timeZero,
        };
    }

    setTimesAt(_pathFlags: PathFlags, path: string, _atime: any, mtime: any) {
        const entry = getChildEntry(this.#entry, path);
        if (mtime?.tag !== "no-change") {
            // Metadata is currently descriptor-local; touching the entry makes
            // the mutation visible through metadata hashes on newly opened handles.
            fileWriteBuffers.delete(entry);
            touch(entry);
        }
    }

    linkAt(
        _pathFlags: PathFlags,
        oldPath: string,
        newDescriptor: BrowserFilesystemDescriptor,
        newPath: string,
    ) {
        const entry = getChildEntry(this.#entry, oldPath);
        if (entry.dir) {
            throw "not-permitted";
        }
        const [newParent, newName] = getParentEntry(
            descriptorGetEntry(newDescriptor as Descriptor),
            newPath,
        );
        if (newParent.dir![newName]) {
            throw "exist";
        }
        newParent.dir![newName] = entry;
        metadata(entry).linkCount++;
        touch(newParent);
    }

    openAt(
        _pathFlags: PathFlags,
        path: string,
        openFlags: OpenFlags,
        _flags: TypesNamespace.DescriptorFlags,
    ) {
        let childEntry: FileDataEntry;
        try {
            childEntry = getChildEntry(this.#entry, path);
            if (openFlags.create && openFlags.exclusive) {
                throw "exist";
            }
        } catch (error) {
            if (error !== "no-entry" || !openFlags.create) {
                throw error;
            }
            const [parent, name] = getParentEntry(this.#entry, path);
            childEntry = parent.dir![name] = openFlags.directory
                ? { dir: {} }
                : { source: new Uint8Array() };
            touch(parent);
        }
        if (openFlags.directory && !childEntry.dir) {
            throw "not-directory";
        }
        if (openFlags.truncate) {
            if (childEntry.dir) {
                throw "is-directory";
            }
            childEntry.source = new Uint8Array();
            touch(childEntry);
        }
        return descriptorCreate(childEntry);
    }

    readlinkAt(_path: string): string {
        throw "unsupported";
    }

    removeDirectoryAt(path: string) {
        const [parent, name] = getParentEntry(this.#entry, path);
        const entry = parent.dir?.[name];
        if (!entry) {
            throw "no-entry";
        }
        if (!entry.dir) {
            throw "not-directory";
        }
        if (Object.keys(entry.dir).length) {
            throw "not-empty";
        }
        delete parent.dir![name];
        metadata(entry).linkCount--;
        touch(parent);
    }

    renameAt(oldPath: string, newDescriptor: BrowserFilesystemDescriptor, newPath: string) {
        const [oldParent, oldName] = getParentEntry(this.#entry, oldPath);
        const entry = oldParent.dir?.[oldName];
        if (!entry) {
            throw "no-entry";
        }
        const [newParent, newName] = getParentEntry(
            descriptorGetEntry(newDescriptor as Descriptor),
            newPath,
        );
        const replaced = newParent.dir![newName];
        if ((oldParent === newParent && oldName === newName) || replaced === entry) {
            return;
        }
        if (entry.dir && containsEntry(entry, newParent)) {
            throw "invalid";
        }
        if (replaced) {
            if (entry.dir && !replaced.dir) {
                throw "not-directory";
            }
            if (!entry.dir && replaced.dir) {
                throw "is-directory";
            }
            if (replaced.dir && Object.keys(replaced.dir).length > 0) {
                throw "not-empty";
            }
            metadata(replaced).linkCount--;
        }
        newParent.dir![newName] = entry;
        delete oldParent.dir![oldName];
        touch(oldParent);
        if (newParent !== oldParent) {
            touch(newParent);
        }
    }

    symlinkAt() {
        throw "unsupported";
    }

    unlinkFileAt(path: string) {
        const [parent, name] = getParentEntry(this.#entry, path);
        const entry = parent.dir?.[name];
        if (!entry) {
            throw "no-entry";
        }
        if (entry.dir) {
            throw "is-directory";
        }
        delete parent.dir![name];
        metadata(entry).linkCount--;
        touch(parent);
    }

    isSameObject(other: BrowserFilesystemDescriptor) {
        return descriptorGetEntry(other as Descriptor) === this.#entry;
    }

    metadataHash() {
        const value = metadata(this.#entry);
        return { upper: value.id, lower: value.version };
    }

    metadataHashAt(_pathFlags: any, path: string) {
        const value = metadata(getChildEntry(this.#entry, path));
        return { upper: value.id, lower: value.version };
    }
}

const descriptorGetEntry = Descriptor.prototype._getEntry;
// @ts-expect-error - Deleting prototype method
delete Descriptor.prototype._getEntry;
const descriptorCreate = Descriptor._create;
// @ts-expect-error - Deleting static method
delete Descriptor._create;

/** Explicit ephemeral storage adapter for browser applications and tests. */
export class InMemoryFilesystemAdapter implements BrowserFilesystemAdapter<FileData> {
    getRoot(capability: FileData): BrowserFilesystemDescriptor {
        if (!capability.dir) {
            throw new TypeError("an in-memory preopen root must be a directory");
        }
        rootEntries.add(capability);
        return descriptorCreate(capability);
    }
}
