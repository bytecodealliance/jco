import { types as TypesNamespace, preopens as PreopensNamespace } from "../../types/filesystem.js";
import { Error as IoError } from "../../types/interfaces/wasi-io-error.js";
import {
    InputStream as IInputStream,
    OutputStream as IOutputStream,
} from "../../types/interfaces/wasi-io-streams.js";
import { inputStreamCreate, outputStreamCreate } from "./io.js";
import { environment } from "./environment.js";
import { _setCwd, _getCwd } from "./config.js";

export { _setCwd } from "./config.js";

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

export interface BrowserFilesystemAdapter<Capability = unknown> {
    getRoot(capability: Capability): FileData;
    dispose?(): void;
}

export interface BrowserFilesystemConfig<Capability> {
    adapter: BrowserFilesystemAdapter<Capability>;
    preopens: Record<string, Capability>;
}

/** Explicit ephemeral storage adapter for browser applications and tests. */
export class InMemoryFilesystemAdapter implements BrowserFilesystemAdapter<FileData> {
    getRoot(capability: FileData): FileData {
        if (!capability.dir) {
            throw new TypeError("an in-memory preopen root must be a directory");
        }
        return capability;
    }
}

export function _setFileData(fileData: FileData): void {
    _fileData = fileData;
    if (_rootPreopen) {
        const descriptor = descriptorCreate(fileData);
        _rootPreopen[0] = descriptor;
    } else {
        _setPreopens({ "/": fileData });
    }
    const cwd = environment.initialCwd();
    _setCwd(cwd || "/");
}

export function _getFileData(): string {
    return JSON.stringify(_fileData);
}

let _fileData: FileData = { dir: {} };

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

function getChildEntry(
    parentEntry: FileDataEntry,
    subpath: string,
    openFlags: OpenFlags,
): FileDataEntry {
    if (subpath === "." && _rootPreopen && descriptorGetEntry(_rootPreopen[0]) === parentEntry) {
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
        } else if (!entry.dir[segment] && openFlags.create) {
            entry = entry.dir[segment] = openFlags.directory
                ? { dir: {} }
                : { source: new Uint8Array([]) };
        } else {
            entry = entry.dir[segment];
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

// Keep spare capacity separate so FileDataEntry.source always reflects the logical file size.
const fileWriteBuffers = new WeakMap<FileDataEntry, Uint8Array>();

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

class DirectoryEntryStream implements TypesNamespace.DirectoryEntryStream {
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

class Descriptor implements TypesNamespace.Descriptor {
    #stream: any;
    #entry!: FileDataEntry;
    #mtime = 0;
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
        this.#mtime++;
    }

    setTimes(_dataAccessTimestamp: any, dataModificationTimestamp: any) {
        if (dataModificationTimestamp?.tag !== "no-change") {
            this.#mtime++;
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
        this.#mtime++;
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
        const entry = getChildEntry(this.#entry, path, {
            create: true,
            directory: true,
        });
        if (entry.source) {
            throw "exist";
        }
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
            linkCount: 0n,
            size,
            dataAccessTimestamp: timeZero,
            dataModificationTimestamp: timeZero,
            statusChangeTimestamp: timeZero,
        };
    }

    statAt(_pathFlags: PathFlags, path: string) {
        const entry = getChildEntry(this.#entry, path, {
            create: false,
            directory: false,
        });
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
            linkCount: 0n,
            size,
            dataAccessTimestamp: timeZero,
            dataModificationTimestamp: timeZero,
            statusChangeTimestamp: timeZero,
        };
    }

    setTimesAt(_pathFlags: PathFlags, path: string, _atime: any, mtime: any) {
        const entry = getChildEntry(this.#entry, path, { create: false, directory: false });
        if (mtime?.tag !== "no-change") {
            // Metadata is currently descriptor-local; touching the entry makes
            // the mutation visible through metadata hashes on newly opened handles.
            fileWriteBuffers.delete(entry);
            this.#mtime++;
        }
    }

    linkAt(
        _pathFlags: PathFlags,
        oldPath: string,
        newDescriptor: TypesNamespace.Descriptor,
        newPath: string,
    ) {
        const entry = getChildEntry(this.#entry, oldPath, { create: false, directory: false });
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
    }

    openAt(
        _pathFlags: PathFlags,
        path: string,
        openFlags: OpenFlags,
        _flags: TypesNamespace.DescriptorFlags,
    ) {
        let childEntry: FileDataEntry;
        try {
            childEntry = getChildEntry(this.#entry, path, {
                create: false,
                directory: false,
            });
            if (openFlags.create && openFlags.exclusive) {
                throw "exist";
            }
        } catch (error) {
            if (error !== "no-entry" || !openFlags.create) {
                throw error;
            }
            childEntry = getChildEntry(this.#entry, path, openFlags);
        }
        if (openFlags.directory && !childEntry.dir) {
            throw "not-directory";
        }
        if (openFlags.truncate) {
            if (childEntry.dir) {
                throw "is-directory";
            }
            childEntry.source = new Uint8Array();
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
    }

    renameAt(oldPath: string, newDescriptor: TypesNamespace.Descriptor, newPath: string) {
        const [oldParent, oldName] = getParentEntry(this.#entry, oldPath);
        const entry = oldParent.dir?.[oldName];
        if (!entry) {
            throw "no-entry";
        }
        const [newParent, newName] = getParentEntry(
            descriptorGetEntry(newDescriptor as Descriptor),
            newPath,
        );
        newParent.dir![newName] = entry;
        delete oldParent.dir![oldName];
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
    }

    isSameObject(other: TypesNamespace.Descriptor) {
        return other === this;
    }

    metadataHash() {
        let upper = 0n;
        upper += BigInt(this.#mtime);
        return { upper, lower: 0n };
    }

    metadataHashAt(_pathFlags: any, _path: string) {
        return this.metadataHash();
    }
}

const descriptorGetEntry = Descriptor.prototype._getEntry;
// @ts-expect-error - Deleting prototype method
delete Descriptor.prototype._getEntry;
const descriptorCreate = Descriptor._create;
// @ts-expect-error - Deleting static method
delete Descriptor._create;

let _preopens: [Descriptor, string][] = [];
let _rootPreopen: [Descriptor, string] | null = null;

export const preopens: typeof PreopensNamespace = {
    getDirectories() {
        return _preopens;
    },
};

/** Create isolated filesystem namespaces backed by an application-selected adapter. */
export function createFilesystem<Capability>({
    adapter,
    preopens: configuredPreopens,
}: BrowserFilesystemConfig<Capability>) {
    const entries: [Descriptor, string][] = Object.entries(configuredPreopens).map(
        ([guestPath, capability]) => [descriptorCreate(adapter.getRoot(capability)), guestPath],
    );
    let disposed = false;
    return {
        types,
        preopens: {
            getDirectories() {
                if (disposed) {
                    throw new Error("filesystem adapter has been disposed");
                }
                return [...entries];
            },
        } as typeof PreopensNamespace,
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            adapter.dispose?.();
        },
    };
}

/**
 * Replace all preopens with the given set.
 * @param preopensConfig - Map of virtual paths to file data entries
 */
export function _setPreopens(preopensConfig: Record<string, FileData>): void {
    _preopens = [];
    for (const [virtualPath, fileData] of Object.entries(preopensConfig)) {
        _addPreopen(virtualPath, fileData);
    }
}

/**
 * Add a single preopen mapping.
 * @param virtualPath - The virtual path visible to the guest
 * @param fileData - The file data object representing the directory
 */
export function _addPreopen(virtualPath: string, fileData: FileData): void {
    const descriptor = descriptorCreate(fileData);
    const entry: [Descriptor, string] = [descriptor, virtualPath];
    _preopens.push(entry);
    if (virtualPath === "/") {
        _rootPreopen = entry;
    }
}

/**
 * Clear all preopens, giving the guest no filesystem access.
 *
 * This functionality exists mostly to maintain backwards compatibility. Prefer setting preopens
 * via `WASIShim` rather than making top level changes to preopens using these functions.
 */
export function _clearPreopens(): void {
    _preopens = [];
    _rootPreopen = null;
}

/**
 * Get current preopens configuration.
 * @returns Array of [descriptor, virtualPath] pairs
 */
export function _getPreopens(): [Descriptor, string][] {
    return [..._preopens];
}

/**
 * Create a preopen descriptor for a host path.
 * This is used internally to create isolated preopen instances.
 * @param  hostPreopen - The host filesystem path
 * @returns A preopen descriptor
 */
export function _createPreopenDescriptor(hostPreopen: string) {
    throw new TypeError(
        `browser preopen ${JSON.stringify(hostPreopen)} is a host path; configure browser file data or an adapter instead`,
    );
}

export const types: typeof TypesNamespace = {
    Descriptor,
    DirectoryEntryStream,
    filesystemErrorCode: (err: IoError) => {
        let message: unknown;
        if ("payload" in err) {
            message = err.payload;
        } else if ("message" in err) {
            message = err.message;
        }
        return convertFsError(message);
    },
};

function convertFsError(e: any): TypesNamespace.ErrorCode {
    switch (e.code) {
        case "EACCES":
            return "access";
        case "EAGAIN":
        case "EWOULDBLOCK":
            return "would-block";
        case "EALREADY":
            return "already";
        case "EBADF":
            return "bad-descriptor";
        case "EBUSY":
            return "busy";
        case "EDEADLK":
            return "deadlock";
        case "EDQUOT":
            return "quota";
        case "EEXIST":
            return "exist";
        case "EFBIG":
            return "file-too-large";
        case "EILSEQ":
            return "illegal-byte-sequence";
        case "EINPROGRESS":
            return "in-progress";
        case "EINTR":
            return "interrupted";
        case "EINVAL":
            return "invalid";
        case "EIO":
            return "io";
        case "EISDIR":
            return "is-directory";
        case "ELOOP":
            return "loop";
        case "EMLINK":
            return "too-many-links";
        case "EMSGSIZE":
            return "message-size";
        case "ENAMETOOLONG":
            return "name-too-long";
        case "ENODEV":
            return "no-device";
        case "ENOENT":
            return "no-entry";
        case "ENOLCK":
            return "no-lock";
        case "ENOMEM":
            return "insufficient-memory";
        case "ENOSPC":
            return "insufficient-space";
        case "ENOTDIR":
        case "ERR_FS_EISDIR":
            return "not-directory";
        case "ENOTEMPTY":
            return "not-empty";
        case "ENOTRECOVERABLE":
            return "not-recoverable";
        case "ENOTSUP":
            return "unsupported";
        case "ENOTTY":
            return "no-tty";
        // windows gives this error for badly structured `//` reads
        // this seems like a slightly better error than unknown given
        // that it's a common footgun
        case -4094:
        case "ENXIO":
            return "no-such-device";
        case "EOVERFLOW":
            return "overflow";
        case "EPERM":
            return "not-permitted";
        case "EPIPE":
            return "pipe";
        case "EROFS":
            return "read-only";
        case "ESPIPE":
            return "invalid-seek";
        case "ETXTBSY":
            return "text-file-busy";
        case "EXDEV":
            return "cross-device";
        case "UNKNOWN":
            switch (e.errno) {
                case -4094:
                    return "no-such-device";
                default:
                    throw e;
            }
        default:
            throw e;
    }
}
