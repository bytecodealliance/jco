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
    // Symlink target, stored verbatim as passed to `symlink-at` (present for symlinks)
    symlink?: string;
}

/**
 * Root file data structure representing a filesystem tree.
 * Each entry is a directory (`dir`), a file (`source`), or a symbolic link (`symlink`).
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

// Bound the total number of symlinks followed during a single path resolution.
const MAX_SYMLINK_DEPTH = 40;

interface ResolvedEntry {
    entry: FileDataEntry | undefined;
    parent: FileDataEntry;
    name: string;
}

/**
 * Resolve from the descriptor's base directory, retaining the directory stack
 * across symlink expansions so `..` cannot escape that capability. Intermediate
 * symlinks always follow; the final segment follows only when requested.
 * Creation may return a missing final entry, together with its resolved parent.
 */
function resolveEntry(
    root: FileDataEntry,
    path: string,
    followFinal: boolean,
    allowMissingFinal = false,
): ResolvedEntry {
    const directories = [root];
    const pending = path.split("/").reverse();
    let followed = 0;
    while (pending.length) {
        const parent = directories[directories.length - 1];
        if (!parent.dir) {
            throw "not-directory";
        }
        const name = pending.pop()!;
        if (name === "" || name === ".") {
            continue;
        }
        if (name === "..") {
            if (directories.length === 1) {
                throw "not-permitted";
            }
            directories.pop();
            continue;
        }
        const entry = parent.dir[name];
        const isFinal = pending.length === 0;
        if (!entry) {
            if (isFinal && allowMissingFinal) {
                return { entry: undefined, parent, name };
            }
            throw "no-entry";
        }
        if (entry.symlink !== undefined && (!isFinal || followFinal)) {
            if (++followed > MAX_SYMLINK_DEPTH) {
                throw "loop";
            }
            if (entry.symlink.startsWith("/")) {
                throw "not-permitted";
            }
            for (const segment of entry.symlink.split("/").reverse()) {
                pending.push(segment);
            }
            continue;
        }
        if (isFinal) {
            return { entry, parent, name };
        }
        directories.push(entry);
    }
    const entry = directories[directories.length - 1];
    return { entry, parent: entry, name: "" };
}

// Preserve the legacy root lookup of `.` without applying CWD substitution to
// symlink targets or to the parent paths used by mutations.
function lookupPath(root: FileDataEntry, path: string): string {
    if (path === "." && rootEntries.has(root)) {
        return _getCwd();
    }
    return path;
}

function getChildEntry(
    parentEntry: FileDataEntry,
    subpath: string,
    followFinal: boolean | undefined,
): FileDataEntry {
    return resolveEntry(parentEntry, lookupPath(parentEntry, subpath), !!followFinal).entry!;
}

function getParentEntry(root: FileDataEntry, path: string): [FileDataEntry, string] {
    const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".");
    const name = segments.pop();
    if (!name || name === "..") {
        throw "invalid";
    }
    const parent = resolveEntry(root, segments.join("/"), true).entry!;
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

function describeEntry(entry: FileDataEntry): {
    type: TypesNamespace.DescriptorType;
    size: Filesize;
} {
    if (entry.symlink !== undefined) {
        // Matches POSIX lstat: a symlink's size is the byte length of its target.
        return {
            type: "symbolic-link",
            size: BigInt(new TextEncoder().encode(entry.symlink).byteLength),
        };
    }
    if (entry.dir) {
        return { type: "directory", size: 0n };
    }
    return { type: "regular-file", size: BigInt(getSource(entry).byteLength) };
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

interface LockState {
    exclusiveHolder: Descriptor | null;
    sharedHolders: Set<Descriptor>;
}

const fileLocks = new WeakMap<FileDataEntry, LockState>();

function lockState(entry: FileDataEntry): LockState {
    let state = fileLocks.get(entry);
    if (!state) {
        state = { exclusiveHolder: null, sharedHolders: new Set() };
        fileLocks.set(entry, state);
    }
    return state;
}

const touchListeners = new Set<(entry: FileDataEntry) => void>();

/**
 * Subscribe to every mutation across every in-memory tree (regardless of which
 * adapter loaded it). Lets a persistence layer (e.g. `OpfsFilesystemAdapter`)
 * react to writes without wrapping every mutating method individually. Returns
 * an unsubscribe function.
 */
export function _onTouch(listener: (entry: FileDataEntry) => void): () => void {
    touchListeners.add(listener);
    return () => touchListeners.delete(listener);
}

function touch(entry: FileDataEntry): void {
    metadata(entry).version++;
    for (const listener of touchListeners) {
        listener(entry);
    }
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
            type: describeEntry(entry).type,
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
    #advice: TypesNamespace.Advice = "normal";

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

    advise(_offset: Filesize, _length: Filesize, advice: TypesNamespace.Advice) {
        if (this.getType() === "directory") {
            throw "bad-descriptor";
        }
        // All data is already resident in memory, so there's nothing to prefetch or
        // evict here. Retain the last hint so it can be inspected by adapters that
        // do have a real backing store to optimize (e.g. a persistent/OPFS adapter).
        this.#advice = advice;
    }

    syncData() {}

    getFlags() {
        return { ...this.#flags };
    }

    getType() {
        if (this.#stream) {
            return "fifo";
        }
        if (this.#entry.symlink !== undefined) {
            return "symbolic-link";
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
            // Existence is checked against the literal entry (mkdir never follows
            // the final path component, even if it's a symlink).
            getChildEntry(this.#entry, path, false);
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
        const { type, size } = describeEntry(this.#entry);
        return {
            type,
            linkCount: metadata(this.#entry).linkCount,
            size,
            dataAccessTimestamp: timeZero,
            dataModificationTimestamp: timeZero,
            statusChangeTimestamp: timeZero,
        };
    }

    statAt(pathFlags: PathFlags, path: string) {
        const entry = getChildEntry(this.#entry, path, pathFlags.symlinkFollow);
        const { type, size } = describeEntry(entry);
        return {
            type,
            linkCount: metadata(entry).linkCount,
            size,
            dataAccessTimestamp: timeZero,
            dataModificationTimestamp: timeZero,
            statusChangeTimestamp: timeZero,
        };
    }

    setTimesAt(pathFlags: PathFlags, path: string, _atime: any, mtime: any) {
        const entry = getChildEntry(this.#entry, path, pathFlags.symlinkFollow);
        if (mtime?.tag !== "no-change") {
            // Metadata is currently descriptor-local; touching the entry makes
            // the mutation visible through metadata hashes on newly opened handles.
            fileWriteBuffers.delete(entry);
            touch(entry);
        }
    }

    linkAt(
        oldPathFlags: PathFlags,
        oldPath: string,
        newDescriptor: BrowserFilesystemDescriptor,
        newPath: string,
    ) {
        // Unlike open/stat, link never follows the final symlink unless the
        // caller explicitly asked for it via `symlink-follow`.
        const entry = getChildEntry(this.#entry, oldPath, oldPathFlags.symlinkFollow);
        if (entry.dir) {
            throw "not-permitted";
        }
        const [newParent, newName] = getParentEntry(
            descriptorGetEntry(unwrapDescriptor(newDescriptor) as Descriptor),
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
        pathFlags: PathFlags,
        path: string,
        openFlags: OpenFlags,
        _flags: TypesNamespace.DescriptorFlags,
    ) {
        const exclusiveCreate = !!(openFlags.create && openFlags.exclusive);
        const resolved = resolveEntry(
            this.#entry,
            lookupPath(this.#entry, path),
            !!pathFlags.symlinkFollow && !exclusiveCreate,
            !!openFlags.create,
        );
        let childEntry = resolved.entry;
        if (childEntry && exclusiveCreate) {
            throw "exist";
        }
        if (!childEntry) {
            const { parent, name } = resolved;
            childEntry = parent.dir![name] = openFlags.directory
                ? { dir: {} }
                : { source: new Uint8Array() };
            touch(parent);
        }
        if (childEntry.symlink !== undefined) {
            // `symlink-follow` was unset and the final path component is a
            // symlink - matches opening with O_NOFOLLOW against a symlink.
            throw "loop";
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

    readlinkAt(path: string): string {
        // The literal entry, never resolved - readlink always reports the
        // immediate target, not what it ultimately points to.
        const entry = getChildEntry(this.#entry, path, false);
        if (entry.symlink === undefined) {
            throw "invalid";
        }
        if (entry.symlink.startsWith("/")) {
            throw "not-permitted";
        }
        return entry.symlink;
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
            descriptorGetEntry(unwrapDescriptor(newDescriptor) as Descriptor),
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

    symlinkAt(oldPath: string, newPath: string) {
        // Matches the Node backend: guest-visible symlink targets are always
        // relative, since this sandboxed filesystem has no host-absolute root.
        if (oldPath.startsWith("/")) {
            throw "not-permitted";
        }
        const [parent, name] = getParentEntry(this.#entry, newPath);
        if (parent.dir![name]) {
            throw "exist";
        }
        parent.dir![name] = { symlink: oldPath };
        touch(parent);
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
        return descriptorGetEntry(unwrapDescriptor(other) as Descriptor) === this.#entry;
    }

    metadataHash() {
        const value = metadata(this.#entry);
        return { upper: value.id, lower: value.version };
    }

    metadataHashAt(pathFlags: PathFlags, path: string) {
        const value = metadata(getChildEntry(this.#entry, path, pathFlags.symlinkFollow));
        return { upper: value.id, lower: value.version };
    }

    /**
     * Default advisory-locking implementation: a same-process reader/writer lock
     * keyed on the underlying entry. There's no real contention to wait out in a
     * single-threaded environment, so `lockShared`/`lockExclusive` don't block -
     * they throw `would-block` immediately when the lock isn't free, same as the
     * `tryLock*` variants report `false`.
     */
    tryLockShared(): boolean {
        const state = lockState(this.#entry);
        if (state.exclusiveHolder && state.exclusiveHolder !== this) {
            return false;
        }
        state.sharedHolders.add(this);
        return true;
    }

    tryLockExclusive(): boolean {
        const state = lockState(this.#entry);
        if (state.exclusiveHolder && state.exclusiveHolder !== this) {
            return false;
        }
        const otherReaders = state.sharedHolders.size - (state.sharedHolders.has(this) ? 1 : 0);
        if (otherReaders > 0) {
            return false;
        }
        state.sharedHolders.delete(this);
        state.exclusiveHolder = this;
        return true;
    }

    lockShared(): void {
        if (!this.tryLockShared()) {
            throw "would-block";
        }
    }

    lockExclusive(): void {
        if (!this.tryLockExclusive()) {
            throw "would-block";
        }
    }

    unlock(): void {
        const state = fileLocks.get(this.#entry);
        if (!state) {
            return;
        }
        state.sharedHolders.delete(this);
        if (state.exclusiveHolder === this) {
            state.exclusiveHolder = null;
        }
    }
}

const descriptorGetEntry = Descriptor.prototype._getEntry;
// @ts-expect-error - Deleting prototype method
delete Descriptor.prototype._getEntry;
const descriptorCreate = Descriptor._create;
// @ts-expect-error - Deleting static method
delete Descriptor._create;

/**
 * Well-known symbol a `BrowserFilesystemDescriptor` wrapper (e.g. the cross-tab-locking
 * `Proxy` from `OpfsFilesystemAdapter`) can implement to hand back the real descriptor it
 * wraps. `renameAt`/`linkAt`/`isSameObject` reach into a *second* descriptor argument's
 * private `#entry` field directly - private-field access bypasses `Proxy` traps and fails
 * its brand check against a wrapper, so a wrapper must be unwrapped via ordinary property
 * access (which a `Proxy` handles correctly) before that field access happens.
 */
export const UNWRAP_DESCRIPTOR: unique symbol = Symbol("browserFilesystemDescriptor.unwrap");

function unwrapDescriptor(descriptor: BrowserFilesystemDescriptor): BrowserFilesystemDescriptor {
    let current = descriptor;
    for (;;) {
        const inner = (current as unknown as Record<symbol, unknown>)[UNWRAP_DESCRIPTOR] as
            | BrowserFilesystemDescriptor
            | undefined;
        if (!inner || inner === current) {
            return current;
        }
        current = inner;
    }
}

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
