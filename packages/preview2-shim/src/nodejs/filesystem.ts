import { WasiResource } from "../common/resource.js";
import { types as TypesNamespace, preopens as PreopensNamespace } from "../../types/filesystem.js";
import type {
    Descriptor as IDescriptor,
    DescriptorFlags,
    DirectoryEntryStream as IDirectoryEntryStream,
} from "../../types/interfaces/wasi-filesystem-types.js";
import { earlyDispose, registerDispose } from "../io/worker-io.js";
import type { PerformanceConfig } from "../../types/instantiation.js";
import { lookupType } from "../io/file-common.js";
import { openWorkerFile, type FileHandle } from "../io/file-handle.js";
import { openMainThreadFile } from "../io/main-thread-file.js";
import {
    constants,
    linkSync,
    lstatSync,
    lutimesSync,
    mkdirSync,
    opendirSync,
    readlinkSync,
    realpathSync,
    renameSync,
    rmdirSync,
    statSync,
    symlinkSync,
    unlinkSync,
    utimesSync,
} from "node:fs";
import { posix, win32 } from "node:path";
import { platform } from "node:process";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

const isWindows = platform === "win32";
const isMac = platform === "darwin";
const hostPath = isWindows ? win32 : posix;
const MAX_SYMLINKS = 40;

export interface NodeFilesystemOptions {
    /**
     * Accept mutate-directory and enforce directory mutation capabilities.
     * Defaults to false for compatibility with guests, including adapted
     * Preview 1 components, that omit the flag on writable directories.
     */
    enableMutateDirectory?: boolean;
    /**
     * Opt-in trade-offs of behavior for speed. A preopen created with this
     * member uses it instead of the defaults set with `_setPerformance`.
     */
    performance?: PerformanceConfig;
}

/** Performance options of preopens created without their own. */
let defaultPerformance: PerformanceConfig = {};

function normalizeHostPath(path: string) {
    return isWindows ? path.replace(/\\/g, "/") : path;
}

/**
 * Resolve symlinks in a host path.
 *
 * Node's realpathSync() cannot walk namespaced Windows paths (`\\?\C:\...`): it
 * stats the namespace root (`\\?\C:`), which is a volume rather than a directory
 * and fails with EISDIR. Drive and UNC paths resolve the same without the prefix.
 */
function realHostPath(path: string) {
    return normalizeHostPath(realpathSync(stripWindowsNamespace(path)));
}

/** Drop the Windows namespace prefix (`\\?\`) from a drive or UNC path. */
function stripWindowsNamespace(path: string) {
    if (!isWindows) {
        return path;
    }
    return (
        path
            .replace(/^[\\/]{2}\?[\\/]UNC[\\/]/i, "//")
            .replace(/^[\\/]{2}\?[\\/]([a-zA-Z]:)(?=[\\/]|$)/, "$1")
            // A bare drive would otherwise resolve against that drive's cwd
            .replace(/^([a-zA-Z]:)$/, "$1/")
    );
}

const nsMagnitude = 1_000_000_000n;
function nsToDateTime(ns) {
    const seconds = ns / nsMagnitude;
    const nanoseconds = Number(ns % nsMagnitude);
    return { seconds, nanoseconds };
}

// Note: This should implement per-segment semantics of openAt, but we cannot
//       currently due to the lack of support for openat() in Node.js.
//       Tracking issue: https://github.com/libuv/libuv/issues/4167

/**
 * @implements {DescriptorProps}
 */
class Descriptor extends WasiResource implements IDescriptor {
    #hostPreopen;
    // The open host file. Preopens and virtual directories have none.
    #file!: FileHandle;
    #finalizer;
    #mode!: DescriptorFlags;
    #enableMutateDirectory = false;
    // Options given to the preopen this descriptor descends from, if any.
    #performance: PerformanceConfig | undefined;
    #fullPath;
    /**
     * Whether `#fullPath` contained no symlinks when this descriptor was opened.
     * False only below the unbounded Windows preopen, whose paths are not resolved.
     */
    #fullPathResolved = false;
    // The resolved #hostPreopen, kept only with cacheDirectoryPaths.
    #realBasePath: string | undefined;
    #virtualDirectory = false;
    private _id = 0;

    static _createPreopen(
        hostPreopen,
        { enableMutateDirectory = false, performance }: NodeFilesystemOptions = {},
    ) {
        const descriptor = new Descriptor();
        descriptor.#performance = performance;
        descriptor.#enableMutateDirectory = enableMutateDirectory;
        if (enableMutateDirectory) {
            descriptor.#mode = { read: true, mutateDirectory: true };
        }
        descriptor.#hostPreopen = hostPreopen.endsWith("/")
            ? hostPreopen.slice(0, -1) || "/"
            : hostPreopen;
        // Windows requires UNC paths at minimum
        if (isWindows) {
            descriptor.#hostPreopen = descriptor.#hostPreopen.replace(/\\/g, "/");
            if (descriptor.#hostPreopen === "/") {
                descriptor.#hostPreopen = "//";
            }
        }
        return descriptor;
    }

    static _create(file: FileHandle, mode, fullPath, fullPathResolved, parent: Descriptor) {
        const descriptor = new Descriptor();
        descriptor.#file = file;
        // The finalizer must not keep the descriptor alive, so it holds the file alone.
        descriptor.#finalizer = registerDispose(descriptor, null, 0, () => file.close());
        descriptor.#enableMutateDirectory = parent.#enableMutateDirectory;
        descriptor.#performance = parent.#performance;
        descriptor.#mode = parent.#enableMutateDirectory ? { ...mode } : mode;
        descriptor.#fullPath = fullPath;
        descriptor.#fullPathResolved = fullPathResolved;
        return descriptor;
    }

    static _createVirtualDirectory(mode, fullPath, fullPathResolved, parent: Descriptor) {
        const descriptor = new Descriptor();
        descriptor.#enableMutateDirectory = parent.#enableMutateDirectory;
        descriptor.#performance = parent.#performance;
        descriptor.#mode = parent.#enableMutateDirectory ? { ...mode } : mode;
        descriptor.#fullPath = fullPath;
        descriptor.#fullPathResolved = fullPathResolved;
        descriptor.#virtualDirectory = true;
        return descriptor;
    }

    /**
     * The performance options in effect for this descriptor: those of its
     * preopen, or else the current defaults.
     */
    get #performanceOptions(): PerformanceConfig {
        return this.#performance ?? defaultPerformance;
    }

    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }

    readViaStream(offset): any {
        if (this.#hostPreopen || this.#virtualDirectory) {
            throw "is-directory";
        }
        return this.#file.readViaStream(offset);
    }

    writeViaStream(offset): any {
        if (this.#hostPreopen || this.#virtualDirectory) {
            throw "is-directory";
        }
        return this.#file.writeViaStream(offset);
    }

    appendViaStream(): any {
        return this.writeViaStream(this.stat().size);
    }

    advise(offset, length, advice) {
        if (this.getType() === "directory") {
            throw "bad-descriptor";
        }
        try {
            this.#file.advise(offset, length, advice);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    syncData() {
        if (this.#hostPreopen) {
            throw "invalid";
        }
        if (this.#virtualDirectory) {
            throw "bad-descriptor";
        }
        try {
            this.#file.syncData();
        } catch (e: any) {
            if (e.code === "EPERM") {
                return;
            }
            throw convertFsError(e);
        }
    }

    getFlags() {
        return this.#enableMutateDirectory ? { ...this.#mode } : this.#mode;
    }

    #assertCanMutateDirectory() {
        // Opt-in: enforcing this by default breaks adapted Preview 1 guests
        // that omit the flag. See jco#1303 and wasmtime#12912.
        if (!this.#enableMutateDirectory) {
            return;
        }
        if (this.getType() !== "directory") {
            throw "not-directory";
        }
        if (!this.#mode.mutateDirectory) {
            throw "read-only";
        }
    }

    getType() {
        if (this.#hostPreopen || this.#virtualDirectory) {
            return "directory";
        }
        // The type read at open, saving a worker round trip: an open file keeps its type.
        return this.#file.type;
    }

    setSize(size) {
        if (this.#hostPreopen || this.#virtualDirectory) {
            throw "is-directory";
        }
        try {
            this.#file.setSize(Number(size));
        } catch (e: any) {
            if (isWindows && e.code === "EPERM") {
                throw "access";
            }
            throw convertFsError(e);
        }
    }

    setTimes(dataAccessTimestamp, dataModificationTimestamp) {
        if (this.#hostPreopen) {
            throw "invalid";
        }
        if (this.#enableMutateDirectory) {
            if (this.getType() === "directory") {
                this.#assertCanMutateDirectory();
            } else if (!this.#mode.write) {
                throw "read-only";
            }
        }
        let stats;
        if (
            dataAccessTimestamp.tag === "no-change" ||
            dataModificationTimestamp.tag === "no-change"
        ) {
            stats = this.stat();
        }
        const atime = this.#getNewTimestamp(
            dataAccessTimestamp,
            dataAccessTimestamp.tag === "no-change" && stats.dataAccessTimestamp,
        );
        const mtime = this.#getNewTimestamp(
            dataModificationTimestamp,
            dataModificationTimestamp.tag === "no-change" && stats.dataModificationTimestamp,
        );
        try {
            if (this.#virtualDirectory) {
                utimesSync(this.#getFullPath(".", true), atime, mtime);
            } else {
                this.#file.setTimes(atime, mtime);
            }
        } catch (e) {
            throw convertFsError(e);
        }
    }

    #getNewTimestamp(newTimestamp, maybeNow) {
        switch (newTimestamp.tag) {
            case "no-change":
                return timestampToMs(maybeNow) / 1000;
            case "timestamp":
                return timestampToMs(newTimestamp.val) / 1000;
            default:
                return Math.floor(Date.now() / 1e3);
        }
    }

    read(length, offset): [Uint8Array, boolean] {
        if (this.#virtualDirectory) {
            throw "is-directory";
        }
        if (!this.#fullPath) {
            throw "bad-descriptor";
        }
        const { bytes, eof } = this.#file.read(Number(length), Number(offset));
        return [bytes, eof];
    }

    write(buffer, offset) {
        if (this.#virtualDirectory) {
            throw "is-directory";
        }
        if (!this.#fullPath) {
            throw "bad-descriptor";
        }
        return BigInt(this.#file.write(buffer, Number(offset)));
    }

    readDirectory(): IDirectoryEntryStream {
        if (!this.#fullPath) {
            throw "bad-descriptor";
        }
        const fullPath = this.#getFullPath(".", true);
        try {
            const dir = opendirSync(fullPath);
            return directoryEntryStreamCreate(dir);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    sync() {
        if (this.#hostPreopen || this.#virtualDirectory) {
            throw "invalid";
        }
        try {
            this.#file.sync();
        } catch (e: any) {
            if (e.code === "EPERM") {
                return;
            }
            throw convertFsError(e);
        }
    }

    createDirectoryAt(path) {
        const fullPath = this.#getFullPath(path, false);
        this.#assertCanMutateDirectory();
        try {
            mkdirSync(fullPath);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    stat() {
        if (this.#hostPreopen) {
            throw "invalid";
        }
        let stats;
        try {
            stats = this.#virtualDirectory
                ? statSync(this.#getFullPath(".", true), { bigint: true })
                : this.#file.stat();
        } catch (e) {
            throw convertFsError(e);
        }
        const type = this.#virtualDirectory ? lookupType(stats) : stats.type;
        return {
            type,
            linkCount: stats.nlink,
            size: stats.size,
            dataAccessTimestamp: nsToDateTime(stats.atimeNs),
            dataModificationTimestamp: nsToDateTime(stats.mtimeNs),
            statusChangeTimestamp: nsToDateTime(stats.ctimeNs),
        };
    }

    statAt(pathFlags, path) {
        const fullPath = this.#getFullPath(path, pathFlags.symlinkFollow);
        let stats;
        try {
            stats = (pathFlags.symlinkFollow ? statSync : lstatSync)(fullPath, {
                bigint: true,
            });
        } catch (e) {
            throw convertFsError(e);
        }
        const type = lookupType(stats);
        return {
            type,
            linkCount: stats.nlink,
            size: stats.size,
            dataAccessTimestamp: nsToDateTime(stats.atimeNs),
            dataModificationTimestamp: nsToDateTime(stats.mtimeNs),
            statusChangeTimestamp: nsToDateTime(stats.ctimeNs),
        };
    }

    setTimesAt(pathFlags, path, dataAccessTimestamp, dataModificationTimestamp) {
        const fullPath = this.#getFullPath(path, pathFlags.symlinkFollow);
        this.#assertCanMutateDirectory();
        let stats;
        if (
            dataAccessTimestamp.tag === "no-change" ||
            dataModificationTimestamp.tag === "no-change"
        ) {
            stats = this.statAt(pathFlags, path);
        }
        const atime = this.#getNewTimestamp(
            dataAccessTimestamp,
            dataAccessTimestamp.tag === "no-change" && stats.dataAccessTimestamp,
        );
        const mtime = this.#getNewTimestamp(
            dataModificationTimestamp,
            dataModificationTimestamp.tag === "no-change" && stats.dataModificationTimestamp,
        );
        if (!pathFlags.symlinkFollow && !lutimesSync) {
            throw new Error("Changing the timestamps of symlinks isn't supported");
        }

        let metadataSetFn = pathFlags.symlinkFollow ? utimesSync : lutimesSync;
        try {
            metadataSetFn(fullPath, atime, mtime);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    linkAt(oldPathFlags, oldPath, newDescriptor, newPath) {
        const oldFullPath = this.#getFullPath(oldPath, oldPathFlags.symlinkFollow);
        const newFullPath = newDescriptor.#getFullPath(newPath, false);
        this.#assertCanMutateDirectory();
        newDescriptor.#assertCanMutateDirectory();
        // Windows doesn't automatically fail on trailing slashes
        if (isWindows && newFullPath.endsWith("/")) {
            throw "no-entry";
        }
        try {
            linkSync(oldFullPath, newFullPath);
        } catch (e) {
            throw convertFsError(e);
        }
    }

    openAt(pathFlags, path, openFlags, descriptorFlags) {
        const fullPath = this.#getFullPath(path, pathFlags.symlinkFollow);
        // Check the original request before normalizing the returned flags.
        // WASI open-at requires read-only if mutate-directory is requested
        // through a base without that capability, even when opening a file.
        if (
            descriptorFlags.write ||
            descriptorFlags.mutateDirectory ||
            openFlags.create ||
            openFlags.truncate
        ) {
            this.#assertCanMutateDirectory();
        }
        let fsOpenFlags = 0x0;
        if (openFlags.create) {
            fsOpenFlags |= constants.O_CREAT;
        }
        if (openFlags.directory) {
            fsOpenFlags |= constants.O_DIRECTORY;
        }
        if (openFlags.exclusive) {
            fsOpenFlags |= constants.O_EXCL;
        }
        if (openFlags.truncate) {
            fsOpenFlags |= constants.O_TRUNC;
        }
        if (descriptorFlags.read && descriptorFlags.write) {
            fsOpenFlags |= constants.O_RDWR;
        } else if (descriptorFlags.write) {
            fsOpenFlags |= constants.O_WRONLY;
        } else if (descriptorFlags.read) {
            fsOpenFlags |= constants.O_RDONLY;
        }
        if (descriptorFlags.fileIntegritySync) {
            fsOpenFlags |= constants.O_SYNC;
        }
        if (descriptorFlags.dataIntegritySync) {
            fsOpenFlags |= constants.O_DSYNC;
        }
        if (!pathFlags.symlinkFollow) {
            fsOpenFlags |= constants.O_NOFOLLOW;
        }
        if (
            descriptorFlags.requestedWriteSync ||
            (descriptorFlags.mutateDirectory && !this.#enableMutateDirectory)
        ) {
            throw "unsupported";
        }
        // Currently throw to match Wasmtime
        if (descriptorFlags.fileIntegritySync || descriptorFlags.dataIntegritySync) {
            throw "unsupported";
        }
        // Below the unbounded Windows preopen the path is used as given.
        const fullPathResolved = !(isWindows && this.#hostPreopen === "//");
        if (isWindows) {
            if (!pathFlags.symlinkFollow && !openFlags.create) {
                let isSymlink = false;
                try {
                    isSymlink = lstatSync(fullPath).isSymbolicLink();
                } catch {
                    //
                }
                if (isSymlink) {
                    throw openFlags.directory ? "not-directory" : "loop";
                }
            }
            if (pathFlags.symlinkFollow && openFlags.directory) {
                let isFile = false;
                try {
                    isFile = !statSync(fullPath).isDirectory();
                } catch {
                    //
                }
                if (isFile) {
                    throw "not-directory";
                }
            }
            // Node cannot open a directory with fs.open on Windows (EISDIR).
            // Directory operations use the path, so keep a descriptor without an fd.
            try {
                if (statSync(fullPath).isDirectory()) {
                    if (descriptorFlags.write || openFlags.create || openFlags.truncate) {
                        throw "is-directory";
                    }
                    return Descriptor._createVirtualDirectory(
                        descriptorFlags,
                        fullPath,
                        fullPathResolved,
                        this,
                    );
                }
            } catch (e: any) {
                if (e === "is-directory") {
                    throw e;
                }
                if (e.code !== "ENOENT") {
                    throw convertFsError(e);
                }
            }
        }
        try {
            const openPath = fullPath.endsWith("/") ? fullPath.slice(0, -1) : fullPath;
            // The main thread declines what could make a call wait, such as a FIFO.
            const file =
                (this.#performanceOptions.mainThreadFilesystem
                    ? openMainThreadFile(openPath, fsOpenFlags)
                    : undefined) ?? openWorkerFile(openPath, fsOpenFlags);
            const type = file.type;
            // Wasmtime's updated path_open_preopen test requires ISDIR for a
            // writable directory on every platform.
            //
            // Windows may still open it, so check the returned descriptor type.
            if (type === "directory" && descriptorFlags.write) {
                // Release the opened handle before reporting the error.
                file.close();
                throw "is-directory";
            }
            // Rust's WASI runtime requests mutate-directory on writable files
            // too, including through Perry. When enabled, accept and clear this
            // directory-only flag on files, as Wasmtime also does. Its broader
            // permission semantics remain disputed (wasmtime#12912).
            // This grants no additional authority:
            // - The original request already passed the base directory's rights check.
            // - File writes still require write.
            // - Directories retain mutate-directory for mutations and writable child opens.
            const descriptor = descriptorCreate(
                file,
                this.#enableMutateDirectory
                    ? {
                          ...descriptorFlags,
                          mutateDirectory:
                              type === "directory" && !!descriptorFlags.mutateDirectory,
                      }
                    : descriptorFlags,
                fullPath,
                fullPathResolved,
                this,
            );
            if (fullPath.endsWith("/") && type !== "directory") {
                descriptor[symbolDispose]();
                throw "not-directory";
            }
            return descriptor;
        } catch (e: any) {
            if (e.code === "ERR_INVALID_ARG_VALUE") {
                throw isWindows ? "no-entry" : "invalid";
            }
            throw convertFsError(e);
        }
    }

    readlinkAt(path) {
        const fullPath = this.#getFullPath(path, false);
        try {
            const target = readlinkSync(fullPath);
            return isWindows ? target.replace(/\\/g, "/") : target;
        } catch (e) {
            throw convertFsError(e);
        }
    }

    removeDirectoryAt(path) {
        const fullPath = this.#getFullPath(path, false);
        this.#assertCanMutateDirectory();
        try {
            rmdirSync(fullPath);
        } catch (e: any) {
            if (isWindows && e.code === "ENOENT") {
                throw "not-directory";
            }
            throw convertFsError(e);
        }
    }

    renameAt(oldPath, newDescriptor, newPath) {
        const oldFullPath = this.#getFullPath(oldPath, false);
        const newFullPath = newDescriptor.#getFullPath(newPath, false);
        this.#assertCanMutateDirectory();
        newDescriptor.#assertCanMutateDirectory();
        try {
            renameSync(oldFullPath, newFullPath);
        } catch (e: any) {
            if (isWindows && e.code === "EPERM") {
                throw "access";
            }
            throw convertFsError(e);
        }
    }

    symlinkAt(target, path) {
        const fullPath = this.#getFullPath(path, false);
        this.#assertCanMutateDirectory();
        if (target.startsWith("/")) {
            throw "not-permitted";
        }
        try {
            symlinkSync(target, fullPath);
        } catch (e: any) {
            if (fullPath.endsWith("/") && e.code === "EEXIST") {
                let isDir = false;
                try {
                    isDir = statSync(fullPath).isDirectory();
                } catch {
                    //
                }
                if (!isDir) {
                    throw isWindows ? "no-entry" : "not-directory";
                }
            }
            if (isWindows) {
                if (e.code === "EPERM" || e.code === "EEXIST") {
                    throw "no-entry";
                }
            }
            throw convertFsError(e);
        }
    }

    unlinkFileAt(path) {
        const fullPath = this.#getFullPath(path, false);
        this.#assertCanMutateDirectory();
        try {
            if (fullPath.endsWith("/")) {
                let isDir = false;
                try {
                    isDir = statSync(fullPath).isDirectory();
                } catch {
                    //
                }
                throw isDir
                    ? isWindows
                        ? "access"
                        : isMac
                          ? "not-permitted"
                          : "is-directory"
                    : "not-directory";
            }
            unlinkSync(fullPath);
        } catch (e: any) {
            if (isWindows && e.code === "EPERM") {
                throw "access";
            }
            throw convertFsError(e);
        }
    }

    isSameObject(other) {
        return other === this;
    }

    metadataHash() {
        if (this.#hostPreopen) {
            return { upper: 0n, lower: BigInt(this._id) };
        }
        if (this.#virtualDirectory) {
            const stats = statSync(this.#getFullPath(".", true), { bigint: true });
            return { upper: stats.mtimeNs, lower: stats.ino };
        }
        try {
            return this.#file.metadataHash();
        } catch (e) {
            throw convertFsError(e);
        }
    }

    metadataHashAt(pathFlags, path) {
        const fullPath = this.#getFullPath(path, pathFlags.symlinkFollow);
        try {
            const stats = (pathFlags.symlinkFollow ? statSync : lstatSync)(fullPath, {
                bigint: true,
            });
            return { upper: stats.mtimeNs, lower: stats.ino };
        } catch (e) {
            throw convertFsError(e);
        }
    }

    /**
     * Resolve a guest path against this descriptor to a host path.
     *
     * The result stays below the directory this descriptor was opened on: `..`
     * and symlink targets may not climb above it, absolute symlink targets are
     * rejected, and so is a descriptor whose own path now passes through a symlink.
     *
     * @param subpath - Guest path, relative to this descriptor
     * @param followFinalSymlink - Whether a symlink in the final component is resolved
     * @returns The host path to operate on
     * @throws A WASI error code, `not-permitted` for paths leaving the descriptor
     */
    #getFullPath(subpath: string, followFinalSymlink: boolean): string {
        subpath = subpath.replace(/\\/g, "/").replace(/\/\/+/g, "/");
        if (subpath.startsWith("/")) {
            throw "not-permitted";
        }

        const trailingSlash = subpath.endsWith("/");
        const segments: string[] = [];
        for (const segment of subpath.split("/")) {
            if (segment === "" || segment === ".") {
                continue;
            }
            if (segment === "..") {
                if (segments.pop() === undefined) {
                    throw "not-permitted";
                }
            } else {
                segments.push(segment);
            }
        }

        const base = this.#hostPreopen ?? this.#fullPath;

        // The default Windows preopen intentionally represents every drive and
        // UNC share, so there is no narrower host boundary to enforce.
        if (isWindows && this.#hostPreopen === "//") {
            const normalized = segments.join("/");
            const fullPath = /^[a-zA-Z]:\//.test(normalized)
                ? `//?/${normalized}`
                : `//${normalized}`;
            return trailingSlash && normalized ? `${fullPath}/` : fullPath;
        }

        let baseResolved: string;
        try {
            // A failed resolution is not kept: the directory may appear later.
            // A descriptor opened below a preopen resolves its path every time,
            // so that the check below sees a symlink put in that path since.
            if (this.#performanceOptions.cacheDirectoryPaths && !this.#fullPathResolved) {
                baseResolved = this.#realBasePath ??= realHostPath(base);
            } else {
                // Nothing kept from a time the option was on may be used later.
                this.#realBasePath = undefined;
                baseResolved = realHostPath(base);
            }
        } catch (error) {
            throw convertFsError(error);
        }

        // Node has no openat(), so a descriptor is only a remembered path. That
        // path had no symlinks when it was opened. If it has one now, the tree
        // was rearranged underneath the descriptor and the path may lead
        // anywhere, including outside the preopen.
        if (
            this.#fullPathResolved &&
            hostPath.relative(stripWindowsNamespace(base), baseResolved) !== ""
        ) {
            throw "not-permitted";
        }

        let current = baseResolved;
        let pending = [...segments];
        let followedSymlinks = 0;

        while (pending.length > 0) {
            const segment = pending.shift()!;
            const candidate = normalizeHostPath(hostPath.join(current, segment));
            let stats;
            try {
                stats = lstatSync(candidate);
            } catch (error: any) {
                if (error.code === "ENOENT") {
                    const unresolved = normalizeHostPath(hostPath.join(candidate, ...pending));
                    return trailingSlash ? `${unresolved}/` : unresolved;
                }
                throw convertFsError(error);
            }

            const isFinal = pending.length === 0;
            if (!stats.isSymbolicLink() || (isFinal && !followFinalSymlink && !trailingSlash)) {
                current = candidate;
                continue;
            }

            if (++followedSymlinks > MAX_SYMLINKS) {
                throw "loop";
            }

            let target: string;
            try {
                target = readlinkSync(candidate);
            } catch (error) {
                throw convertFsError(error);
            }

            let targetSegments: string[];
            if (hostPath.isAbsolute(target)) {
                throw "not-permitted";
            } else {
                const relativeCurrent = hostPath.relative(baseResolved, current);
                targetSegments = relativeCurrent ? relativeCurrent.split(hostPath.sep) : [];
                for (const targetSegment of target.replace(/\\/g, "/").split("/")) {
                    if (targetSegment === "" || targetSegment === ".") {
                        continue;
                    }
                    if (targetSegment === "..") {
                        if (targetSegments.pop() === undefined) {
                            throw "not-permitted";
                        }
                    } else {
                        targetSegments.push(targetSegment);
                    }
                }
            }

            pending = [...targetSegments, ...pending];
            current = baseResolved;
        }

        return trailingSlash && current !== baseResolved ? `${current}/` : current;
    }
}
const descriptorCreatePreopen = Descriptor._createPreopen;
// @ts-expect-error - Deleting static method
delete Descriptor._createPreopen;
const descriptorCreate = Descriptor._create;
// @ts-expect-error - Deleting static method
delete Descriptor._create;

class DirectoryEntryStream extends WasiResource implements IDirectoryEntryStream {
    #dir;
    #finalizer;
    readDirectoryEntry() {
        let entry;
        try {
            entry = this.#dir.readSync();
        } catch (e) {
            throw convertFsError(e);
        }
        if (entry === null) {
            return undefined;
        }
        const name = entry.name;
        const type = lookupType(entry);
        return { name, type };
    }
    static _create(dir) {
        const dirStream = new DirectoryEntryStream();
        dirStream.#finalizer = registerDispose(dirStream, null, 0, dir.closeSync.bind(dir));
        dirStream.#dir = dir;
        return dirStream;
    }
    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}
const directoryEntryStreamCreate = DirectoryEntryStream._create;
// @ts-expect-error Deleting static method
delete DirectoryEntryStream._create;

let preopenEntries: Array<[Descriptor, string]> = [];

export const preopens: typeof PreopensNamespace = {
    getDirectories() {
        return preopenEntries;
    },
};

export const types: typeof TypesNamespace = {
    Descriptor,
    DirectoryEntryStream,
    filesystemErrorCode(err: any) {
        return convertFsError(err.payload);
    },
};

/** Create isolated filesystem namespaces from Node.js host-path preopens. */
export function createFilesystem({
    preopens,
    enableMutateDirectory = false,
    performance,
}: { preopens: Record<string, string> } & NodeFilesystemOptions) {
    const entries: Array<[Descriptor, string]> = Object.entries(preopens).map(
        ([virtualPath, hostPath]) => [
            descriptorCreatePreopen(hostPath, { enableMutateDirectory, performance }),
            virtualPath,
        ],
    );
    return {
        types,
        preopens: {
            getDirectories: () => [...entries],
        } as typeof PreopensNamespace,
    };
}

/**
 * Set the performance options of every preopen that was not created with its own.
 *
 * The options take effect for files opened and paths resolved from then on,
 * including through preopens that already exist. Files that are already open
 * stay where they were opened.
 *
 * @example
 * import { _setPerformance } from '@bytecodealliance/preview2-shim/filesystem';
 * _setPerformance({ mainThreadFilesystem: true });
 *
 * @param options - the options to use; members left out are off
 */
export function _setPerformance(options: PerformanceConfig = {}) {
    defaultPerformance = { ...options };
}

/**
 * Replace all preopens with the given set.
 * @param {Record<string, string>} preopens - Map of virtual paths to host paths
 */
export function _setPreopens(preopens, options: NodeFilesystemOptions = {}) {
    preopenEntries = [];
    for (const [virtualPath, hostPreopen] of Object.entries(preopens)) {
        _addPreopen(virtualPath, hostPreopen, options);
    }
}

/**
 * Add a single preopen mapping.
 * @param {string} virtualPath - The virtual path visible to the guest
 * @param {string} hostPreopen - The host filesystem path
 */
export function _addPreopen(virtualPath, hostPreopen, options: NodeFilesystemOptions = {}) {
    const preopenEntry: [Descriptor, string] = [
        descriptorCreatePreopen(hostPreopen, options),
        virtualPath,
    ];
    preopenEntries.push(preopenEntry);
}

/**
 * Clear all preopens, giving the guest no filesystem access.
 *
 * @example
 * import { _clearPreopens } from '@bytecodealliance/preview2-shim/filesystem';
 * _clearPreopens();
 */
export function _clearPreopens() {
    preopenEntries = [];
}

/**
 * Get current preopens configuration.
 * @returns {Array<[Descriptor, string]>} Array of [descriptor, virtualPath] pairs
 */
export function _getPreopens() {
    return [...preopenEntries];
}

/**
 * Create a preopen descriptor for a host path.
 * This is used internally to create isolated preopen instances.
 * @param  hostPreopen - The host filesystem path
 * @returns A preopen descriptor
 */
export function _createPreopenDescriptor(hostPreopen: string, options: NodeFilesystemOptions = {}) {
    return descriptorCreatePreopen(hostPreopen, options);
}

function convertFsError(e) {
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

function timestampToMs(timestamp) {
    let secondsInMillis = timestamp.seconds * 1000n;
    if (secondsInMillis > Number.MAX_SAFE_INTEGER) {
        throw new Error(`cannot represent millisecond amount as Number [${{ secondsInMillis }}]`);
    }
    if (timestamp.nanoseconds > Number.MAX_SAFE_INTEGER) {
        throw new Error(`cannot represent millisecond amount as Number [${{ secondsInMillis }}]`);
    }
    let remainderFractionalMillis = timestamp.nanoseconds / 1_000_000;
    const res = Number(secondsInMillis) + remainderFractionalMillis;
    return res;
}
