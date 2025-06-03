import fs from 'node:fs/promises';
import process from 'node:process';

import { StreamReader } from '../stream.js';
import { FSError } from './error.js';
import { FutureReader } from '../future.js';
import { ResourceWorker } from '../workers/resource-worker.js';
import { earlyDispose, registerDispose } from '../finalization.js';

const symbolDispose = Symbol.dispose || Symbol.for('dispose');

const _worker = new ResourceWorker(
    new URL('../workers/filesystem-worker.js', import.meta.url)
);

class Descriptor {
    /** Node.js file handle for file operations (FileHandle from fs.promises.open) */
    #handle;
    /** Descriptor flags */
    #mode;
    /** Absolute filesystem path to the file or directory */
    #fullPath;
    /** Cleanup finalizer */
    #finalizer;
    /** Host filesystem path for preopened directories */
    #hostPreopen;

    static _create(handle, mode, fullPath) {
        const {
            read = false,
            write = false,
            fileIntegritySync = false,
            dataIntegritySync = false,
            requestedIntegritySync = false,
            mutateDirectory = false,
        } = mode;

        const merged = {
            read,
            write,
            fileIntegritySync,
            dataIntegritySync,
            requestedIntegritySync,
            mutateDirectory,
        };

        const desc = new Descriptor();
        desc.#handle = handle;
        desc.#fullPath = fullPath;
        desc.#mode = merged;
        desc.#finalizer = registerDispose(desc, null, handle, (handle) =>
            handle.close()
        );

        return desc;
    }

    static _createPreopen(hostPreopen) {
        const desc = new Descriptor();

        if (hostPreopen.endsWith('/')) {
            desc.#hostPreopen = hostPreopen.slice(0, -1) || '/';
        } else {
            desc.#hostPreopen = hostPreopen;
        }

        // Windows requires UNC paths at minimum
        if (process.platform === 'win32') {
            desc.#hostPreopen = desc.#hostPreopen.replace(/\\/g, '/');
            if (desc.#hostPreopen === '/') {
                desc.#hostPreopen = '//';
            }
        }
        return desc;
    }

    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
        this.#handle = null;
    }

    /**
     * Return a stream for reading from a file.
     * WIT:
     * ```
     * read-via-stream: func(offset: filesize) -> tuple<stream<u8>, future<result<_, error-code>>>
     * ```
     *
     * @param {bigint} offset The offset within the file.
     * @returns {{stream: StreamReader, future: FutureReader}}
     *   A tuple: a readable byte stream and a future that resolves to an error code.
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    readViaStream(offset) {
        this.#ensureHandle();
        const transform = new TransformStream();
        const promise = _worker
            .run(
                {
                    op: 'read',
                    fd: this.#handle.fd,
                    offset,
                    stream: transform.writable,
                },
                [transform.writable]
            )
            .catch((err) => {
                throw FSError.from(err);
            });

        return {
            stream: new StreamReader(transform.readable),
            future: new FutureReader(promise),
        };
    }

    /**
     * Write to a file via a byte stream.
     * WIT:
     * ```
     * write-via-stream: async func(data: stream<u8>, offset: filesize) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {object} data A data source implementing `intoReadableStream()`.
     * @param {bigint} offset The offset within the file.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async writeViaStream(data, offset) {
        this.#ensureHandle();
        const stream = await data.intoReadableStream();

        try {
            await _worker.run(
                { op: 'write', fd: this.#handle.fd, offset, stream },
                [stream]
            );
        } catch (err) {
            throw FSError.from(err);
        }
    }

    /**
     * Append to a file via a byte stream.
     * WIT:
     * ```
     * append-via-stream: async func(data: stream<u8>) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {object} data A data source implementing `intoReadableStream()`.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async appendViaStream(data) {
        this.#ensureHandle();
        const offset = await this.#handle.stat().then((s) => s.size);
        return this.writeViaStream(data, offset);
    }

    /**
     * Advisory on file access patterns.
     * WIT:
     * ```
     * advise: async func(offset: filesize, length: filesize, advice: advice) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {bigint} offset Start of the region.
     * @param {bigint} length Length of the region.
     * @param {string} advice One of the Wasi `advice` values.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async advise(_offset, _length, _advice) {
        // TODO: This not directly suported on Node.js:
        // https://github.com/bytecodealliance/jco/issues/718
        if (this.getType() === 'directory') {
            throw new FSError('bad-descriptor');
        }
    }

    /**
     * Synchronize file data to disk.
     * WIT:
     * ```
     * sync-data: async func() -> result<_, error-code>
     * ```
     *
     * @async
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async syncData() {
        this.#ensureHandle();
        try {
            await this.#handle.datasync();
        } catch (e) {
            // On windows, `sync_data` uses `FileFlushBuffers` which fails with `EPERM` if
            // the file is not upen for writing. Ignore this error, for POSIX compatibility.
            if (process.platform === 'win32' && e.code === 'EPERM') {
                return;
            }
            throw FSError.from(e);
        }
    }

    /**
     * Get flags associated with a descriptor.
     * WIT:
     * ```
     * get-flags: async func() -> result<descriptor-flags, error-code>
     * ```
     *
     * @async
     * @returns {Promise<object>} The descriptor flags object.
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async getFlags() {
        return this.#mode;
    }

    /**
     * Get the dynamic type of a descriptor.
     * WIT:
     * ```
     * get-type: async func() -> result<descriptor-type, error-code>
     * ```
     *
     * @async
     * @returns {Promise<string>} The descriptor type.
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async getType() {
        if (this.#hostPreopen) {
            return 'directory';
        }
        try {
            const stats = await this.#handle.stat();
            return wasiTypeFromDirent(stats);
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Adjust the size of an open file.
     * WIT:
     * ```
     * set-size: async func(size: filesize) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {bigint} size The new size.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async setSize(size) {
        this.#ensureHandle();

        if (size > Number.MAX_SAFE_INTEGER) {
            throw new FSError('invalid');
        }

        try {
            await this.#handle.truncate(Number(size));
        } catch (e) {
            if (process.platform === 'win32' && e.code === 'EPERM') {
                throw new FSError('access');
            }
            throw FSError.from(e);
        }
    }

    /**
     * Adjust the timestamps of an open file or directory.
     * WIT:
     * ```
     * set-times: async func(data-access-timestamp: new-timestamp, data-modification-timestamp: new-timestamp) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {object} atimeDesc new-timestamp descriptor
     * @param {object} mtimeDesc new-timestamp descriptor
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async setTimes(atimeDesc, mtimeDesc) {
        this.#ensureHandle();

        const { atime, mtime } = await this.#computeTimestamps(
            atimeDesc,
            mtimeDesc
        );

        try {
            await this.#handle.utimes(atime, mtime);
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Read directory entries via a stream.
     * WIT:
     * ```
     * read-directory: async func() -> tuple<stream<directory-entry>, future<result<_, error-code>>>
     * ```
     *
     * @async
     * @returns {{stream: StreamReader, future: FutureReader}}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    readDirectory() {
        if (!this.#fullPath) {
            throw new FSError('invalid');
        }

        const preopens = preopenEntries.map(
            ([desc, _virtualPath]) => desc.#hostPreopen
        );

        const transform = new TransformStream();
        const promise = _worker
            .run(
                {
                    op: 'readDir',
                    fullPath: this.#fullPath,
                    stream: transform.writable,
                    preopens,
                },
                [transform.writable]
            )
            .catch((err) => {
                throw FSError.from(err);
            });

        return {
            stream: new StreamReader(transform.readable),
            future: new FutureReader(promise),
        };
    }

    /**
     * Synchronize data & metadata to disk.
     * WIT:
     * ```
     * sync: async func() -> result<_, error-code>
     * ```
     *
     * @async
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async sync() {
        return this.#hostPreopen ? this.#syncDir() : this.#syncFile();
    }

    /**
     * Create a directory.
     * WIT:
     * ```
     * create-directory-at: async func(path: string) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {string} path Relative path.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async createDirectoryAt(path) {
        const full = this.#getFullPath(path, false);
        try {
            await fs.mkdir(full);
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Return attributes of an open file or directory.
     * WIT:
     * ```
     * stat: async func() -> result<descriptor-stat, error-code>
     * ```
     *
     * @async
     * @returns {Promise<object>} File statistics.
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async stat() {
        try {
            let s;
            if (this.#hostPreopen) {
                s = await fs.stat(this.#hostPreopen, { bigint: true });
            } else {
                this.#ensureHandle();
                s = await this.#handle.stat({ bigint: true });
            }

            return {
                type: wasiTypeFromDirent(s),
                linkCount: s.nlink,
                size: s.size,
                dataAccessTimestamp: nsToDateTime(s.atimeNs),
                dataModificationTimestamp: nsToDateTime(s.mtimeNs),
                statusChangeTimestamp: nsToDateTime(s.ctimeNs),
            };
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Adjust timestamps on a file or symlink.
     * WIT:
     * ```
     * set-times-at: async func(
     *   path-flags: path-flags,
     *   path: string,
     *   data-access-timestamp: new-timestamp,
     *   data-modification-timestamp: new-timestamp
     * ) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {object} flags Path flags.
     * @param {string} path Relative path.
     * @param {object} atimeDesc New access timestamp.
     * @param {object} mtimeDesc New modification timestamp.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async statAt(flags, path) {
        const full = this.#getFullPath(path, flags.symlinkFollow);
        try {
            const statFn = flags.symlinkFollow ? fs.stat : fs.lstat;
            const s = await statFn(full, { bigint: true });
            return {
                type: wasiTypeFromDirent(s),
                linkCount: s.nlink,
                size: s.size,
                dataAccessTimestamp: nsToDateTime(s.atimeNs),
                dataModificationTimestamp: nsToDateTime(s.mtimeNs),
                statusChangeTimestamp: nsToDateTime(s.ctimeNs),
            };
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Adjust timestamps on a file or symlink.
     * WIT:
     * ```
     * set-times-at: async func(
     *   path-flags: path-flags,
     *   path: string,
     *   data-access-timestamp: new-timestamp,
     *   data-modification-timestamp: new-timestamp
     * ) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {object} flags Path flags.
     * @param {string} path Relative path.
     * @param {object} atimeDesc New access timestamp.
     * @param {object} mtimeDesc New modification timestamp.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async setTimesAt(flags, path, atimeDesc, mtimeDesc) {
        const { atime, mtime } = await this.#computeTimestamps(
            atimeDesc,
            mtimeDesc,
            path
        );

        if (!flags.symlinkFollow && !fs.lutimes) {
            throw new FSError('unsupported');
        }

        const full = this.#getFullPath(path, flags.symlinkFollow);

        try {
            const utimesFn = flags.symlinkFollow ? fs.utimes : fs.lutimes;
            await utimesFn(full, atime, mtime);
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Create a hard link.
     * WIT:
     * ```
     * link-at: async func(
     *   old-path-flags: path-flags,
     *   old-path: string,
     *   new-descriptor: borrow<descriptor>,
     *   new-path: string
     * ) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {object} oldFlags Old path flags.
     * @param {string} oldPath Source path.
     * @param {Descriptor} newDesc Target descriptor.
     * @param {string} newPath Destination path.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async linkAt(oldFlags, oldPath, newDesc, newPath) {
        const src = this.#getFullPath(oldPath, oldFlags.symlinkFollow);
        const dst = newDesc.#getFullPath(newPath, false);

        // On Windows, a trailing '/' means the path is treated as a
        // directory and hard links to directory are not supported
        if (process.platform === 'win32' && dst.endsWith('/')) {
            throw new FSError('no-entry');
        }

        try {
            await fs.link(src, dst);
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Open a file or directory.
     * WIT:
     * ```
     * open-at: async func(
     *   path-flags: path-flags,
     *   path: string,
     *   open-flags: open-flags,
     *   %flags: descriptor-flags
     * ) -> result<descriptor, error-code>
     * ```
     *
     * @async
     * @param {object} pf - path flags
     * @param {string} path - relative path
     * @param {object} of - open flags
     * @param {object} df - descriptor flags
     * @returns {Promise<Descriptor>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async openAt(pf, path, of, df) {
        if (!preopenEntries.length) {
            throw new FSError('access');
        }

        const fullPath = this.#getFullPath(path, pf.symlinkFollow);
        const target = stripTrailingSlash(fullPath);

        // prettier-ignore
        const makeFsFlags = () => {
            let fsFlags = 0;
            if (of.create)                 {fsFlags |= fs.constants.O_CREAT;}
            if (of.directory)              {fsFlags |= fs.constants.O_DIRECTORY;}
            if (of.exclusive)              {fsFlags |= fs.constants.O_EXCL;}
            if (of.truncate)               {fsFlags |= fs.constants.O_TRUNC;}
            if (df.read && df.write)       {fsFlags |= fs.constants.O_RDWR;}
            else if (df.write)             {fsFlags |= fs.constants.O_WRONLY;}
            else if (df.read)              {fsFlags |= fs.constants.O_RDONLY;}
            if (df.fileIntegritySync)      {fsFlags |= fs.constants.O_SYNC;}
            if (df.requestedIntegritySync) {fsFlags |= fs.constants.O_SYNC;}
            if (df.dataIntegritySync)      {fsFlags |= fs.constants.O_DSYNC;}
            if (!pf.symlinkFollow)         {fsFlags |= fs.constants.O_NOFOLLOW;}
            return fsFlags;
        }

        const fsFlags = makeFsFlags();

        if (process.platform === 'win32') {
            if (!pf.symlinkFollow && !of.create) {
                const isSymlink = await fs
                    .lstat(fullPath)
                    .then((p) => p.isSymbolicLink())
                    .catch(() => false);

                if (isSymlink) {
                    const tag = of.directory ? 'not-directory' : 'loop';
                    throw new FSError(tag);
                }
            }

            if (pf.symlinkFollow && of.directory) {
                const isFile = await fs
                    .stat(fullPath)
                    .then((p) => !p.isDirectory())
                    .catch(() => false);

                if (isFile) {
                    throw new FSError('not-directory');
                }
            }
        }

        try {
            const handle = await fs.open(target, fsFlags);
            const desc = descriptorCreate(handle, df, fullPath);
            const isDir = (await desc.getType()) === 'directory';

            if (fullPath.endsWith('/') && !isDir) {
                desc[symbolDispose]();
                throw new FSError('not-directory');
            }
            return desc;
        } catch (err) {
            if (err.code === 'ERR_INVALID_ARG_VALUE') {
                throw process.platform === 'win32' ? 'no-entry' : 'invalid';
            }
            throw FSError.from(err);
        }
    }

    /**
     * Read the contents of a symbolic link.
     * WIT:
     * ```
     * readlink-at: async func(path: string) -> result<string, error-code>
     * ```
     *
     * @async
     * @param {string} path Relative path.
     * @returns {Promise<string>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async readlinkAt(path) {
        const full = this.#getFullPath(path, false);
        try {
            return await fs.readlink(full);
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Remove a directory.
     * WIT:
     * ```
     * remove-directory-at: async func(path: string) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {string} path Relative path.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async removeDirectoryAt(path) {
        const full = this.#getFullPath(path, false);
        try {
            await fs.rmdir(full);
        } catch (e) {
            if (process.platform === 'win32' && e.code === 'ENOENT') {
                throw new FSError('not-directory');
            }
            throw FSError.from(e);
        }
    }

    /**
     * Rename a filesystem object.
     * WIT:
     * ```
     * rename-at: async func(old-path: string, new-descriptor: borrow<descriptor>, new-path: string) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {string} oldPath Source path.
     * @param {Descriptor} newDesc Target descriptor.
     * @param {string} newPath Destination path.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async renameAt(oldPath, newDesc, newPath) {
        const src = this.#getFullPath(oldPath, false);
        const dst = newDesc.#getFullPath(newPath, false);
        try {
            await fs.rename(src, dst);
        } catch (e) {
            if (process.platform === 'win32' && e.code === 'EPERM') {
                throw new FSError('access');
            }
            throw FSError.from(e);
        }
    }

    /**
     * Create a symbolic link.
     * WIT:
     * ```
     * symlink-at: async func(old-path: string, new-path: string) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {string} target Link target.
     * @param {string} path Destination path.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async symlinkAt(target, path) {
        if (target.startsWith('/')) {
            throw new FSError('not-permitted');
        }
        const full = this.#getFullPath(path, false);

        try {
            await fs.symlink(target, full);
        } catch (e) {
            if (full.endsWith('/') && e.code === 'EEXIST') {
                const isDir = (await fs.stat(full)).isDirectory();
                const isWin = process.platform === 'win32';
                if (!isDir) {
                    const tag = isWin ? 'no-entry' : 'not-directory';
                    throw new FSError(tag);
                }
            }

            if (
                process.platform === 'win32' &&
                ['EPERM', 'EEXIST'].includes(e.code)
            ) {
                throw new FSError('no-entry');
            }

            throw FSError.from(e);
        }
    }

    /**
     * Unlink a filesystem object that is not a directory.
     * WIT:
     * ```
     * unlink-file-at: async func(path: string) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {string} path Relative path.
     * @returns {Promise<void>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async unlinkFileAt(path) {
        const full = this.#getFullPath(path, false);
        if (full.endsWith('/')) {
            const isDir = (await fs.stat(full)).isDirectory();
            if (isDir) {
                if (process.platform === 'win32') {
                    throw new FSError('access');
                } else if (process.platform === 'darwin') {
                    throw new FSError('not-permitted');
                } else {
                    throw new FSError('is-directory');
                }
            }
        }

        try {
            await fs.unlink(full);
        } catch (err) {
            if (process.platform === 'win32' && err.code === 'EPERM') {
                throw new FSError('access');
            } else {
                throw FSError.from(err);
            }
        }
    }

    /**
     * Test whether two descriptors refer to the same object.
     * WIT:
     * ```
     * is-same-object: async func(other: borrow<descriptor>) -> bool
     * ```
     *
     * @async
     * @param {Descriptor} other Another descriptor.
     * @returns {Promise<boolean>}
     */
    isSameObject(other) {
        return other === this;
    }

    /**
     * Return a hash of the metadata associated with this descriptor.
     * WIT:
     * ```
     * metadata-hash: async func() -> result<metadata-hash-value, error-code>
     * ```
     *
     * @async
     * @returns {Promise<{upper: bigint, lower: bigint}>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async metadataHash() {
        if (this.#hostPreopen) {
            return { upper: 0n, lower: BigInt(this._id) };
        }
        try {
            const s = await this.#handle.stat();
            return { upper: s.mtimeNs, lower: s.ino };
        } catch (e) {
            throw FSError.from(e);
        }
    }

    /**
     * Return a hash of the metadata via path.
     * WIT:
     * ```
     * metadata-hash-at: async func(path-flags: path-flags, path: string) -> result<metadata-hash-value, error-code>
     * ```
     *
     * @async
     * @param {object} flags Path flags.
     * @param {string} path Relative path.
     * @returns {Promise<{upper: bigint, lower: bigint}>}
     * @throws {FSError} `payload.tag` contains mapped WASI error code.
     */
    async metadataHashAt(flags, path) {
        const full = this.#getFullPath(path, false);
        try {
            const statFn = flags.symlinkFollow ? fs.stat : fs.lstat;
            const s = await statFn(full);
            return { upper: s.mtimeNs, lower: s.ino };
        } catch (e) {
            throw FSError.from(e);
        }
    }

    async #syncDir() {
        try {
            const handle = await fs.open(
                this.#hostPreopen,
                fs.constants.O_RDONLY
            );
            try {
                await handle.sync();
            } finally {
                await handle.close();
            }
        } catch (e) {
            throw FSError.from(e);
        }
    }

    async #syncFile() {
        this.#ensureHandle();
        try {
            await this.#handle.sync();
        } catch (e) {
            // On windows, `sync_data` uses `FileFlushBuffers` which fails with `EPERM` if
            // the file is not upen for writing. Ignore this error, for POSIX compatibility.
            if (process.platform === 'win32' && e.code === 'EPERM') {
                return;
            }
            throw FSError.from(e);
        }
    }

    #getNewTimestamp(newTimestamp, oldTimestamp) {
        switch (newTimestamp.tag) {
            case 'now':
                return Math.floor(Date.now() / 1e3);
            case 'no-change':
                return timestampToSec(oldTimestamp);
            case 'timestamp':
                return timestampToSec(newTimestamp.val);
            default:
                throw new FSError(
                    'invalid',
                    `Unknown new-timestamp tag: ${newTimestamp.tag}`
                );
        }
    }

    async #computeTimestamps(atimeDesc, mtimeDesc, path = null) {
        let stats;
        if (atimeDesc.tag === 'no-change' || mtimeDesc.tag === 'no-change') {
            const flags = { symlinkFollow: true };
            const p = path === null ? this.stat() : this.statAt(flags, path);
            stats = await p;
        }

        const atime = this.#getNewTimestamp(
            atimeDesc,
            stats?.dataAccessTimestamp
        );
        const mtime = this.#getNewTimestamp(
            mtimeDesc,
            stats?.dataModificationTimestamp
        );
        return { atime, mtime };
    }

    /**
     * Resolve a relative subpath against this descriptor.
     */
    #getFullPath(subpath, _followSymlinks) {
        subpath = subpath.replaceAll('\\', '/').replace(/\/\/+/g, '/');

        if (subpath.startsWith('/')) {
            throw new FSError('not-permitted');
        }

        const segments = [];
        for (const seg of subpath.split('/')) {
            if (seg === '' || seg === '.') {
                continue;
            }
            if (seg === '..') {
                if (segments.length === 0) {
                    throw new FSError('not-permitted');
                }
                segments.pop();
            } else {
                segments.push(seg);
            }
        }

        const base = this.#hostPreopen ?? this.#fullPath;
        if (segments.length === 0) {
            return base;
        }

        const baseNormalized = stripTrailingSlash(base);
        return `${baseNormalized}/${segments.join('/')}`;
    }

    #ensureHandle() {
        if (!this.#handle) {
            throw new FSError('bad-descriptor');
        }
    }
}

const descriptorCreatePreopen = Descriptor._createPreopen;
delete Descriptor._createPreopen;

const descriptorCreate = Descriptor._create;
delete Descriptor._create;

function wasiTypeFromDirent(obj) {
    if (obj.isFile()) {
        return 'regular-file';
    } else if (obj.isSocket()) {
        return 'socket';
    } else if (obj.isSymbolicLink()) {
        return 'symbolic-link';
    } else if (obj.isFIFO()) {
        return 'fifo';
    } else if (obj.isDirectory()) {
        return 'directory';
    } else if (obj.isCharacterDevice()) {
        return 'character-device';
    } else if (obj.isBlockDevice()) {
        return 'block-device';
    }
    return 'unknown';
}

const NS_PER_SEC = 1_000_000_000n;
function nsToDateTime(ns) {
    const seconds = ns / NS_PER_SEC;
    const nanoseconds = Number(ns % NS_PER_SEC);
    return { seconds, nanoseconds };
}

function timestampToSec({ seconds, nanoseconds }) {
    return Number(seconds) + nanoseconds / 1e9;
}

function stripTrailingSlash(path) {
    if (path === '/') {
        return '/';
    }
    return path.replace(/\/+$/, '');
}

const preopenEntries = [];
export const preopens = {
    Descriptor,
    getDirectories: () => preopenEntries,
};

/**
 * Set the preopen table.
 *
 * @param {Record<string, string>} entries
 */
export function _setPreopens(entries) {
    preopenEntries.length = 0;
    Object.entries(entries).forEach(([virtualPath, hostPreopen]) =>
        _addPreopen(virtualPath, hostPreopen)
    );
}

/**
 * Add a new preopen mapping.
 *
 * @param {string} virtualPath
 * @param {string} hostPreopen
 */
export function _addPreopen(virtualPath, hostPreopen) {
    preopenEntries.push([descriptorCreatePreopen(hostPreopen), virtualPath]);
}
