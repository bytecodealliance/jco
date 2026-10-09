import { types as TypesNamespace, preopens as PreopensNamespace } from "../../types/filesystem.js";
import { Error as IoError } from "../../types/interfaces/wasi-io-error.js";
import { environment } from "./environment.js";
import { InMemoryFilesystemAdapter } from "./in-memory-filesystem.js";
import type { FileData } from "./in-memory-filesystem.js";
import { _setCwd } from "./config.js";

export { _setCwd } from "./config.js";
export { InMemoryFilesystemAdapter } from "./in-memory-filesystem.js";
export type { FileData, FileDataEntry } from "./in-memory-filesystem.js";
export { OpfsFilesystemAdapter, loadOpfsCapability } from "./opfs-filesystem.js";
export type { OpfsCapability } from "./opfs-filesystem.js";

type Filesize = TypesNamespace.Filesize;
type OpenFlags = TypesNamespace.OpenFlags;
type PathFlags = TypesNamespace.PathFlags;

export interface BrowserDirectoryEntryStream {
    readDirectoryEntry(): TypesNamespace.DirectoryEntry | undefined;
}

export interface BrowserFilesystemDescriptor extends Omit<
    TypesNamespace.Descriptor,
    "isSameObject" | "linkAt" | "openAt" | "readDirectory" | "renameAt"
> {
    readDirectory(): BrowserDirectoryEntryStream;
    linkAt(
        oldPathFlags: PathFlags,
        oldPath: string,
        newDescriptor: BrowserFilesystemDescriptor,
        newPath: string,
    ): void;
    openAt(
        pathFlags: PathFlags,
        path: string,
        openFlags: OpenFlags,
        flags: TypesNamespace.DescriptorFlags,
    ): BrowserFilesystemDescriptor;
    renameAt(oldPath: string, newDescriptor: BrowserFilesystemDescriptor, newPath: string): void;
    isSameObject(other: BrowserFilesystemDescriptor): boolean;

    /**
     * Advisory locking, for host application code holding a descriptor directly
     * (not part of the WASI guest-facing surface). Adapters that support it should
     * implement all five; `tryLock*` return whether the lock was acquired instead
     * of throwing.
     */
    lockShared?(): void;
    lockExclusive?(): void;
    tryLockShared?(): boolean;
    tryLockExclusive?(): boolean;
    unlock?(): void;
}

export interface BrowserFilesystemAdapter<Capability = unknown> {
    getRoot(capability: Capability): BrowserFilesystemDescriptor;
    dispose?(): void;
}

export interface BrowserFilesystemConfig<Capability> {
    adapter: BrowserFilesystemAdapter<Capability>;
    preopens: Record<string, Capability>;
}

class DirectoryEntryStream implements TypesNamespace.DirectoryEntryStream {
    #implementation!: BrowserDirectoryEntryStream;

    static _create(implementation: BrowserDirectoryEntryStream) {
        const stream = new DirectoryEntryStream();
        stream.#implementation = implementation;
        return stream;
    }

    readDirectoryEntry() {
        return this.#implementation.readDirectoryEntry();
    }
}

const directoryEntryStreamCreate = DirectoryEntryStream._create;
// @ts-expect-error - Deleting static method
delete DirectoryEntryStream._create;

class Descriptor implements TypesNamespace.Descriptor {
    #implementation!: BrowserFilesystemDescriptor;

    _getImplementation(descriptor: Descriptor) {
        return descriptor.#implementation;
    }

    static _create(implementation: BrowserFilesystemDescriptor) {
        const descriptor = new Descriptor();
        descriptor.#implementation = implementation;
        return descriptor;
    }

    readViaStream(offset: Filesize) {
        return this.#implementation.readViaStream(offset);
    }

    writeViaStream(offset: Filesize) {
        return this.#implementation.writeViaStream(offset);
    }

    appendViaStream() {
        return this.#implementation.appendViaStream();
    }

    advise(offset: Filesize, length: Filesize, advice: TypesNamespace.Advice) {
        return this.#implementation.advise(offset, length, advice);
    }

    syncData() {
        return this.#implementation.syncData();
    }

    getFlags() {
        return this.#implementation.getFlags();
    }

    getType() {
        return this.#implementation.getType();
    }

    setSize(size: Filesize) {
        return this.#implementation.setSize(size);
    }

    setTimes(
        dataAccessTimestamp: TypesNamespace.NewTimestamp,
        dataModificationTimestamp: TypesNamespace.NewTimestamp,
    ) {
        return this.#implementation.setTimes(dataAccessTimestamp, dataModificationTimestamp);
    }

    read(length: Filesize, offset: Filesize) {
        return this.#implementation.read(length, offset);
    }

    write(buffer: Uint8Array, offset: Filesize) {
        return this.#implementation.write(buffer, offset);
    }

    readDirectory() {
        return directoryEntryStreamCreate(this.#implementation.readDirectory());
    }

    sync() {
        return this.#implementation.sync();
    }

    createDirectoryAt(path: string) {
        return this.#implementation.createDirectoryAt(path);
    }

    stat() {
        return this.#implementation.stat();
    }

    statAt(pathFlags: PathFlags, path: string) {
        return this.#implementation.statAt(pathFlags, path);
    }

    setTimesAt(
        pathFlags: PathFlags,
        path: string,
        dataAccessTimestamp: TypesNamespace.NewTimestamp,
        dataModificationTimestamp: TypesNamespace.NewTimestamp,
    ) {
        return this.#implementation.setTimesAt(
            pathFlags,
            path,
            dataAccessTimestamp,
            dataModificationTimestamp,
        );
    }

    linkAt(
        oldPathFlags: PathFlags,
        oldPath: string,
        newDescriptor: TypesNamespace.Descriptor,
        newPath: string,
    ) {
        return this.#implementation.linkAt(
            oldPathFlags,
            oldPath,
            descriptorGetImplementation(newDescriptor as Descriptor),
            newPath,
        );
    }

    openAt(
        pathFlags: PathFlags,
        path: string,
        openFlags: OpenFlags,
        flags: TypesNamespace.DescriptorFlags,
    ) {
        return descriptorCreate(this.#implementation.openAt(pathFlags, path, openFlags, flags));
    }

    readlinkAt(path: string) {
        return this.#implementation.readlinkAt(path);
    }

    removeDirectoryAt(path: string) {
        return this.#implementation.removeDirectoryAt(path);
    }

    renameAt(oldPath: string, newDescriptor: TypesNamespace.Descriptor, newPath: string) {
        return this.#implementation.renameAt(
            oldPath,
            descriptorGetImplementation(newDescriptor as Descriptor),
            newPath,
        );
    }

    symlinkAt(oldPath: string, newPath: string) {
        return this.#implementation.symlinkAt(oldPath, newPath);
    }

    unlinkFileAt(path: string) {
        return this.#implementation.unlinkFileAt(path);
    }

    isSameObject(other: TypesNamespace.Descriptor) {
        return this.#implementation.isSameObject(descriptorGetImplementation(other as Descriptor));
    }

    metadataHash() {
        return this.#implementation.metadataHash();
    }

    metadataHashAt(pathFlags: PathFlags, path: string) {
        return this.#implementation.metadataHashAt(pathFlags, path);
    }

    lockShared() {
        return this.#implementation.lockShared?.();
    }

    lockExclusive() {
        return this.#implementation.lockExclusive?.();
    }

    tryLockShared() {
        return this.#implementation.tryLockShared?.() ?? false;
    }

    tryLockExclusive() {
        return this.#implementation.tryLockExclusive?.() ?? false;
    }

    unlock() {
        return this.#implementation.unlock?.();
    }
}

const descriptorGetImplementation = Descriptor.prototype._getImplementation;
// @ts-expect-error - Deleting prototype method
delete Descriptor.prototype._getImplementation;
const descriptorCreate = Descriptor._create;
// @ts-expect-error - Deleting static method
delete Descriptor._create;

const defaultAdapter = new InMemoryFilesystemAdapter();
let _fileData: FileData = { dir: {} };
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

export function _setFileData(fileData: FileData): void {
    _fileData = fileData;
    if (_rootPreopen) {
        _rootPreopen[0] = descriptorCreate(defaultAdapter.getRoot(fileData));
    } else {
        _setPreopens({ "/": fileData });
    }
    const cwd = environment.initialCwd();
    _setCwd(cwd || "/");
}

export function _getFileData(): string {
    return JSON.stringify(_fileData);
}

/**
 * Replace all preopens with the given set.
 * @param preopensConfig - Map of virtual paths to file data entries
 */
export function _setPreopens(preopensConfig: Record<string, FileData>): void {
    _preopens = [];
    _rootPreopen = null;
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
    const descriptor = descriptorCreate(defaultAdapter.getRoot(fileData));
    const entry: [Descriptor, string] = [descriptor, virtualPath];
    _preopens.push(entry);
    if (virtualPath === "/") {
        _rootPreopen = entry;
    }
}

/**
 * Add a single preopen backed by a custom adapter (e.g. `OpfsFilesystemAdapter`) instead of the
 * default in-memory one. Lets a host wire an alternative `BrowserFilesystemAdapter` into the
 * top-level `wasi:filesystem/preopens` singleton that transpiled components import statically.
 * @param virtualPath - The virtual path visible to the guest
 * @param adapter - The adapter that will back this preopen
 * @param capability - The adapter-specific capability to load as the preopen's root
 */
export function _addPreopenWithAdapter<Capability>(
    virtualPath: string,
    adapter: BrowserFilesystemAdapter<Capability>,
    capability: Capability,
): void {
    const descriptor = descriptorCreate(adapter.getRoot(capability));
    const entry: [Descriptor, string] = [descriptor, virtualPath];
    _preopens.push(entry);
    if (virtualPath === "/") {
        _rootPreopen = entry;
    }
}

/** Clear all preopens, giving the guest no filesystem access. */
export function _clearPreopens(): void {
    _preopens = [];
    _rootPreopen = null;
}

/** Get current preopens configuration. */
export function _getPreopens(): [Descriptor, string][] {
    return [..._preopens];
}

export interface WriteFileAtOptions {
    append?: boolean;
}

/**
 * Write bytes into a preopened directory's tree from host JS, without a guest.
 *
 * Only uses the public `Descriptor` interface, so it works with any adapter.
 * @param virtualPath - The preopen's guest-visible path, as passed to `_setPreopens`/`_addPreopen`
 * @param path - Path relative to `virtualPath`
 * @param data - Bytes to write
 * @param options.append - When true, append to the end of the file instead of truncating it
 */
export function _writeFileAt(
    virtualPath: string,
    path: string,
    data: Uint8Array,
    options: WriteFileAtOptions = {},
): void {
    const file = openFileAt(virtualPath, path, { create: true, truncate: !options.append });
    const offset = options.append ? file.stat().size : 0n;
    file.write(data, offset);
}

/**
 * Read the full contents of a file under a preopened directory from host JS, without a guest.
 *
 * Only uses the public `Descriptor` interface, so it works with any adapter.
 * @param virtualPath - The preopen's guest-visible path, as passed to `_setPreopens`/`_addPreopen`
 * @param path - Path relative to `virtualPath`
 */
export function _readFileAt(virtualPath: string, path: string): Uint8Array {
    const file = openFileAt(virtualPath, path, {});
    const chunks: Uint8Array[] = [];
    let length = 0;
    let offset = 0n;
    for (;;) {
        const [bytes, eof] = file.read(1024n * 1024n, offset);
        if (bytes.byteLength > 0) {
            chunks.push(bytes);
            length += bytes.byteLength;
            offset += BigInt(bytes.byteLength);
        }
        if (eof) {
            break;
        }
    }
    const result = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) {
        result.set(chunk, position);
        position += chunk.byteLength;
    }
    return result;
}

function openFileAt(virtualPath: string, path: string, openFlags: OpenFlags): Descriptor {
    const entry = _preopens.find(([, guestPath]) => guestPath === virtualPath);
    if (!entry) {
        throw new Error(`no preopen for ${JSON.stringify(virtualPath)}`);
    }
    const [root] = entry;

    const segments = path.split("/").filter((segment) => segment && segment !== ".");
    const fileName = segments.pop();
    if (!fileName) {
        throw new Error(`invalid path: ${JSON.stringify(path)}`);
    }

    let dir: Descriptor = root;
    for (const segment of segments) {
        try {
            dir.createDirectoryAt(segment);
        } catch (error) {
            if (error !== "exist") {
                throw error;
            }
        }
        dir = dir.openAt({ symlinkFollow: true }, segment, { directory: true }, {});
    }

    return dir.openAt({ symlinkFollow: true }, fileName, openFlags, {});
}

/** Reject host paths because browser filesystems require explicit capabilities. */
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
