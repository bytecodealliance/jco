import fs from "node:fs";
import { createRequire } from "node:module";
import nodePath from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";

import type { Dir, NewTime, Stat } from "@bytecodealliance/jco-node-fs";

import { StreamReader, readableByteStreamFromReader } from "../stream.js";
import { FutureReader } from "../future.js";
import { ResourceWorker } from "../workers/resource-worker.js";
import { earlyDispose, registerDispose } from "../finalization.js";

import { FSError } from "./error.js";
import { wasiTypeFromDirent } from "./utils.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

const closeAsync = promisify(fs.close);
const fdatasyncAsync = promisify(fs.fdatasync);
const fstatAsync = promisify(fs.fstat) as (
  fd: number,
  options: { bigint: true },
) => Promise<fs.BigIntStats>;
const fsyncAsync = promisify(fs.fsync);
const ftruncateAsync = promisify(fs.ftruncate);
const futimesAsync = promisify(fs.futimes);

const require = createRequire(import.meta.url);
let nativeFs: typeof import("@bytecodealliance/jco-node-fs") | undefined;

/**
 * Load the native filesystem helper
 *
 * Directory descriptors are handles opened by the helper, which is what
 * confines a guest to its preopened directories. There is no path-based
 * fallback, since that would silently drop the confinement: without the helper
 * every filesystem operation fails
 *
 * @returns {typeof import("@bytecodealliance/jco-node-fs")} The helper
 * @throws {Error} If the helper has no build for this host or cannot be loaded
 */
function native() {
  if (!nativeFs) {
    try {
      nativeFs = require("@bytecodealliance/jco-node-fs");
    } catch (cause) {
      throw new Error(
        "WASI filesystem access requires the native helper @bytecodealliance/jco-node-fs, " +
          "which could not be loaded on this host",
        { cause },
      );
    }
  }
  return nativeFs;
}

/**
 * An open file, with the subset of the Node.js `FileHandle` interface that
 * descriptors use
 *
 * Files are opened through a directory handle, which yields a file descriptor
 * rather than a `FileHandle`
 */
class OpenFile {
  /**
   * @param {number} fd The file descriptor, owned by this object
   */
  constructor(readonly fd: number) {}

  /** @returns {Promise<import("node:fs").BigIntStats>} The file's attributes */
  stat() {
    return fstatAsync(this.fd, { bigint: true });
  }

  /** @returns {Promise<void>} Settles once the file's data is flushed */
  datasync() {
    return fdatasyncAsync(this.fd);
  }

  /** @returns {Promise<void>} Settles once the file's data and metadata are flushed */
  sync() {
    return fsyncAsync(this.fd);
  }

  /**
   * @param {number} size The new size in bytes
   * @returns {Promise<void>}
   */
  truncate(size: number) {
    return ftruncateAsync(this.fd, size);
  }

  /**
   * @param {number} atime The access time in seconds
   * @param {number} mtime The modification time in seconds
   * @returns {Promise<void>}
   */
  utimes(atime: number, mtime: number) {
    return futimesAsync(this.fd, atime, mtime);
  }

  /** @returns {Promise<void>} Settles once the file descriptor is closed */
  close() {
    return closeAsync(this.fd);
  }
}

let WORKER = null;
function worker() {
  return (WORKER ??= new ResourceWorker(
    () => new Worker(new URL("../workers/filesystem-worker.bundle.js", import.meta.url)),
  ));
}

/**
 * Write a byte stream to a file in the filesystem worker
 *
 * @param {OpenFile} handle The open file
 * @param {object} data A readable byte stream
 * @param {{ offset: bigint | number } | { append: true }} position Where to write, either
 *   at an offset within the file or at its end, wherever that is when each chunk is written
 * @returns {Promise<void>}
 * @throws {FSError} `payload.tag` contains mapped WASI error code
 */
async function writeFileViaStream(handle, data, position) {
  const stream = readableByteStreamFromReader(data, { name: "file write data" });

  try {
    await worker().run({ op: "write", fd: handle.fd, ...position, stream }, [stream]);
  } catch (err) {
    throw FSError.from(err);
  }
}

/**
 * Code of the error a worker operation fails with when the stream it was
 * producing could not take more output, see the filesystem worker
 */
const STREAM_CLOSED = "ERR_JCO_STREAM_CLOSED";

/**
 * Start a worker operation that produces a stream, ex: the contents of a file
 *
 * The operation ends when the consumer releases the stream before its end, ex:
 * when the guest drops it. As in Wasmtime, that is not an error. A stream that
 * is garbage collected without being released ends the operation the same
 * way, so that the worker does not wait on it forever.
 *
 * @param {(writable: WritableStream) => Promise<unknown>} start Starts the
 *   operation that writes to the transferable `writable`
 * @returns {[StreamReader, FutureReader]} The stream and the operation's result
 */
function streamFromWorker(start) {
  const transform = new TransformStream();
  const reader = transform.readable.getReader();

  // Shared with the finalizer, so it must not refer to `iterator`
  const state = { cancelled: false };
  const cancel = () => {
    state.cancelled = true;
    return reader.cancel().catch(() => {});
  };

  const iterator = {
    next() {
      return reader.read();
    },
    async return(value) {
      await cancel();
      return { done: true, value };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  // Generated bindings take the iterator out of the `StreamReader` and drop the
  // reader, so the iterator is the object whose collection means nothing can
  // read the stream anymore
  registerDispose(iterator, null, cancel, (cancelStream) => void cancelStream());

  const promise = start(transform.writable).catch((err) => {
    if (err?.code === STREAM_CLOSED) {
      if (state.cancelled) {
        return undefined;
      }
      // The stream failed although nothing here cancelled it, so the consumer
      // may have received only part of the output
      throw new FSError("io", "stream closed before all output was delivered", undefined, {
        cause: err,
      });
    }
    throw FSError.from(err);
  });

  return [new StreamReader(iterator), new FutureReader(promise)];
}

/**
 * Owns an open file on behalf of a descriptor and the operations started from it
 *
 * Stream operations run in the filesystem worker with the raw fd, and the
 * guest can drop the descriptor while one is still running, ex: by
 * dropping a `write-via-stream` result without awaiting it. Closing the handle
 * would fail the operation's remaining reads/writes or let them use
 * whichever file reuses the fd number. Closing therefore waits until the last
 * operation settles
 *
 * Every use of the handle goes through `use`, so that no operation can be
 * left holding a handle, or its fd, that has since been closed
 */
class SharedFileHandle {
  /** The open file, or null once closed */
  #handle;
  /** Number of operations that are using the handle */
  #operations = 0;
  /** Whether the owning descriptor has been disposed */
  #closeRequested = false;

  /**
   * @param {OpenFile} handle The handle to own
   */
  constructor(handle) {
    this.#handle = handle;
  }

  /**
   * Run an operation, keeping the handle open until the operation settles
   *
   * @template T
   * @param {(handle: OpenFile) => Promise<T>} operation
   *   The operation to run with the open handle
   * @returns {Promise<T>} The operation's result
   */
  async use(operation) {
    this.#operations += 1;
    try {
      return await operation(this.#handle);
    } finally {
      this.#operations -= 1;
      this.#closeIfUnused();
    }
  }

  /** Close the handle now, or once the last operation using it settles */
  close() {
    this.#closeRequested = true;
    this.#closeIfUnused();
  }

  #closeIfUnused() {
    if (this.#closeRequested && this.#operations === 0 && this.#handle) {
      const handle = this.#handle;
      this.#handle = null;
      // This runs once the descriptor is gone and the last operation has
      // settled, so no caller is left that a failure to close could be reported to
      handle.close().catch(() => {});
    }
  }
}

class Descriptor {
  /**
   * Owner of the open file for file operations, which keeps it open for
   * in-flight operations. Null for directories and once the descriptor is
   * disposed
   */
  #sharedHandle;
  /** Descriptor flags */
  #mode;
  /** Cleanup finalizer */
  #finalizer;
  /** Host filesystem path for preopened directories */
  #hostPreopen;
  /**
   * Handle of the directory this descriptor refers to, which every path
   * operation is relative to. Undefined for files, and for a preopen until
   * its first use
   */
  #dir: Dir | undefined;
  /** The pending open of a preopen's directory, on its first use. */
  #opening: Promise<Dir> | undefined;
  /** Whether this descriptor refers to a directory. */
  #isDirectory = false;

  /**
   * Create a descriptor for an open file or directory
   *
   * @param {OpenFile | Dir} opened The open file, or the directory's handle
   * @param {object} mode Descriptor flags
   * @returns {Descriptor}
   */
  static _create(opened, mode) {
    const {
      read = false,
      write = false,
      fileIntegritySync = false,
      dataIntegritySync = false,
      requestedWriteSync = false,
      mutateDirectory = false,
    } = mode;

    const merged = {
      read,
      write,
      fileIntegritySync,
      dataIntegritySync,
      requestedWriteSync,
      mutateDirectory,
    };

    const desc = new Descriptor();
    desc.#mode = merged;
    if (opened instanceof OpenFile) {
      desc.#sharedHandle = new SharedFileHandle(opened);
      desc.#finalizer = registerDispose(desc, null, desc.#sharedHandle, (sharedHandle) =>
        sharedHandle.close(),
      );
    } else {
      // A directory handle that is never closed is released with the descriptor
      desc.#dir = opened;
      desc.#isDirectory = true;
    }

    return desc;
  }

  static _createPreopen(hostPreopen) {
    const desc = new Descriptor();
    desc.#isDirectory = true;
    desc.#mode = {
      read: true,
      write: false,
      fileIntegritySync: false,
      dataIntegritySync: false,
      requestedWriteSync: false,
      mutateDirectory: true,
    };

    if (hostPreopen.endsWith("/")) {
      desc.#hostPreopen = hostPreopen.slice(0, -1) || "/";
    } else {
      desc.#hostPreopen = hostPreopen;
    }

    // Windows requires UNC paths at minimum
    if (process.platform === "win32") {
      desc.#hostPreopen = desc.#hostPreopen.replace(/\\/g, "/");
      if (desc.#hostPreopen === "/") {
        desc.#hostPreopen = "//";
      }
    }
    return desc;
  }

  [symbolDispose]() {
    if (this.#finalizer) {
      earlyDispose(this.#finalizer);
      this.#finalizer = null;
    }
    this.#sharedHandle = null;

    // A preopen is handed out again by `get-directories`, so it stays usable
    if (!this.#hostPreopen) {
      this.#dir?.close();
    }
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
    const sharedHandle = this.#sharedHandle;
    return streamFromWorker((stream) =>
      sharedHandle.use((handle) =>
        worker().run({ op: "read", fd: handle.fd, offset, stream }, [stream]),
      ),
    );
  }

  /**
   * Write to a file via a byte stream.
   * WIT:
   * ```
   * write-via-stream: async func(data: stream<u8>, offset: filesize) -> result<_, error-code>
   * ```
   *
   * @async
   * @param {object} data A readable byte stream.
   * @param {bigint} offset The offset within the file.
   * @returns {Promise<void>}
   * @throws {FSError} `payload.tag` contains mapped WASI error code.
   */
  async writeViaStream(data, offset) {
    this.#ensureWritable(data);
    return this.#sharedHandle.use((handle) => writeFileViaStream(handle, data, { offset }));
  }

  /**
   * Append to a file via a byte stream.
   * WIT:
   * ```
   * append-via-stream: async func(data: stream<u8>) -> result<_, error-code>
   * ```
   *
   * @async
   * @param {object} data A readable byte stream.
   * @returns {Promise<void>}
   * @throws {FSError} `payload.tag` contains mapped WASI error code.
   */
  async appendViaStream(data) {
    this.#ensureWritable(data);
    // The worker looks up the end of the file for each chunk as it writes it
    return this.#sharedHandle.use((handle) => writeFileViaStream(handle, data, { append: true }));
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
  async advise(offset, length, advice) {
    this.#ensureHandle();
    try {
      // The fd is only read once the module has loaded, so the handle is held until then
      await this.#sharedHandle.use(async (handle) => {
        const { fadvise } = await import("@bytecodealliance/jco-node-fs");
        fadvise(handle.fd, offset, length, advice);
      });
    } catch (error) {
      throw FSError.from(error);
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
    if (this.#isDirectory) {
      return this.#syncDir();
    }
    this.#ensureHandle();
    try {
      await this.#sharedHandle.use((handle) => handle.datasync());
    } catch (e) {
      // On windows, `sync_data` uses `FileFlushBuffers` which fails with `EPERM` if
      // the file is not upen for writing. Ignore this error, for POSIX compatibility.
      if (process.platform === "win32" && e.code === "EPERM") {
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
    if (this.#isDirectory) {
      return { tag: "directory" };
    }
    try {
      this.#ensureHandle();
      const stats = await this.#sharedHandle.use((handle) => handle.stat());
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
      throw new FSError("invalid");
    }

    try {
      await this.#sharedHandle.use((handle) => handle.truncate(Number(size)));
    } catch (e) {
      if (process.platform === "win32" && e.code === "EPERM") {
        throw new FSError("access");
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
    if (this.#isDirectory) {
      const dir = await this.#directory();
      const [atime, mtime] = [newTime(atimeDesc), newTime(mtimeDesc)];
      try {
        await dir.promises.setTimes(atime, mtime);
      } catch (e) {
        throw FSError.from(e);
      }
      return;
    }

    this.#ensureHandle();
    const sharedHandle = this.#sharedHandle;

    const { atime, mtime } = await this.#computeTimestamps(atimeDesc, mtimeDesc, () => this.stat());

    try {
      await sharedHandle.use((handle) => handle.utimes(atime, mtime));
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
    // The listing is taken from the directory's handle, so it is of the
    // directory that was opened, whatever its path refers to by now
    const listing = this.#directory().then((dir) => dir.promises.readDir());
    const entries = listing.then(
      (list) => list.map(({ name, type }) => ({ name, type: descriptorType(type) })),
      // The failure is reported by the future, and the stream is empty
      () => [],
    );
    const result = listing.then(
      () => {},
      (e) => {
        throw FSError.from(e);
      },
    );

    return [new StreamReader(iteratorOf(entries)), new FutureReader(result)];
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
    return this.#isDirectory ? this.#syncDir() : this.#syncFile();
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
    const dir = await this.#directory(path);
    try {
      await dir.promises.createDirAt(path);
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
      if (this.#isDirectory) {
        return descriptorStatFromHandle(await (await this.#directory()).promises.stat());
      }

      this.#ensureHandle();
      const s = await this.#sharedHandle.use((handle) => handle.stat());
      return descriptorStat(s);
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
    const dir = await this.#directory(path);
    try {
      return descriptorStatFromHandle(
        await dir.promises.statAt(path, Boolean(flags.symlinkFollow)),
      );
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
    const dir = await this.#directory(path);
    const [atime, mtime] = [newTime(atimeDesc), newTime(mtimeDesc)];
    try {
      await dir.promises.setTimesAt(path, atime, mtime, Boolean(flags.symlinkFollow));
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
    const dir = await this.#directory(oldPath);
    const newDir = await newDesc.#directory(newPath);

    // On Windows, a trailing '/' means the path is treated as a
    // directory and hard links to directory are not supported
    if (process.platform === "win32" && /[\\/]$/.test(newPath)) {
      throw new FSError("no-entry");
    }

    try {
      // A symlink at `oldPath` is linked itself, whatever `oldFlags` says
      await dir.promises.linkAt(oldPath, newDir, newPath);
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
      throw new FSError("access");
    }

    const dir = await this.#directory(path);
    const mode = {
      ...df,
      read: df.read || !df.write,
      write: df.write || of.create || of.truncate,
    };

    let opened;
    try {
      opened = await dir.promises.openAt(path, {
        read: Boolean(mode.read),
        write: Boolean(mode.write),
        create: Boolean(of.create),
        exclusive: Boolean(of.exclusive),
        truncate: Boolean(of.truncate),
        directory: Boolean(of.directory),
        follow: Boolean(pf.symlinkFollow),
        sync: Boolean(df.fileIntegritySync || df.requestedWriteSync),
        dsync: Boolean(df.dataIntegritySync),
      });
    } catch (err) {
      throw FSError.from(err);
    }

    return descriptorCreate(typeof opened === "number" ? new OpenFile(opened) : opened, mode);
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
    const dir = await this.#directory(path);
    let target;
    try {
      target = await dir.promises.readlinkAt(path);
    } catch (e) {
      throw FSError.from(e);
    }
    // A relative target is returned even if it leads outside this directory,
    // but an absolute target is a host path, which is not exposed
    if (nodePath.isAbsolute(target)) {
      throw new FSError("not-permitted");
    }
    return target;
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
    if (path === ".") {
      throw new FSError("invalid");
    }
    const dir = await this.#directory(path);
    try {
      await dir.promises.removeDirAt(path);
    } catch (e) {
      if (process.platform === "win32" && e.code === "ENOENT") {
        throw new FSError("not-directory");
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
    const dir = await this.#directory(oldPath);
    const newDir = await newDesc.#directory(newPath);
    try {
      await dir.promises.renameAt(oldPath, newDir, newPath);
    } catch (e) {
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
    if (target.startsWith("/")) {
      throw new FSError("not-permitted");
    }
    const dir = await this.#directory(target, path);

    try {
      await dir.promises.symlinkAt(target, path);
    } catch (e) {
      const isWin = process.platform === "win32";
      if (path.endsWith("/") && e.code === "EEXIST") {
        let isDir = false;
        try {
          isDir = (await dir.promises.statAt(path, true)).type === "directory";
        } catch {
          // Not a directory, as far as the guest can tell
        }
        if (!isDir) {
          throw new FSError(isWin ? "no-entry" : "not-directory");
        }
      }

      if (isWin && e.code === "EEXIST") {
        throw new FSError("no-entry");
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
    const dir = await this.#directory(path);
    try {
      await dir.promises.unlinkAt(path);
    } catch (err) {
      throw FSError.from(err);
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
  async isSameObject(other) {
    const [left, right] = await Promise.all([this.#statForIdentity(), other.#statForIdentity()]);
    return left.dev === right.dev && left.ino === right.ino;
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
    try {
      const s = await this.#statForIdentity();
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
    const dir = await this.#directory(path);
    try {
      const s = await dir.promises.statAt(path, Boolean(flags.symlinkFollow));
      return { upper: s.mtimeNs, lower: s.ino };
    } catch (e) {
      throw FSError.from(e);
    }
  }

  async #syncDir() {
    try {
      await (await this.#directory()).promises.sync();
    } catch (e) {
      throw FSError.from(e);
    }
  }

  async #syncFile() {
    this.#ensureHandle();
    try {
      await this.#sharedHandle.use((handle) => handle.sync());
    } catch (e) {
      // On windows, `sync_data` uses `FileFlushBuffers` which fails with `EPERM` if
      // the file is not upen for writing. Ignore this error, for POSIX compatibility.
      if (process.platform === "win32" && e.code === "EPERM") {
        return;
      }
      throw FSError.from(e);
    }
  }

  #getNewTimestamp(newTimestamp, oldTimestamp) {
    switch (newTimestamp.tag) {
      case "now":
        return Math.floor(Date.now() / 1e3);
      case "no-change":
        return timestampToSec(oldTimestamp);
      case "timestamp":
        return timestampToSec(newTimestamp.val);
      default:
        throw new FSError("invalid", `Unknown new-timestamp tag: ${newTimestamp.tag}`);
    }
  }

  /**
   * Resolve a pair of `new-timestamp` values to the times to set
   *
   * @param {object} atimeDesc New access timestamp
   * @param {object} mtimeDesc New modification timestamp
   * @param {() => Promise<object>} currentStat Looks up the `descriptor-stat` of the
   *   object whose times are set, called only if a timestamp is `no-change`
   * @returns {Promise<{ atime: number, mtime: number }>} The times in seconds
   * @throws {FSError} `payload.tag` contains mapped WASI error code
   */
  async #computeTimestamps(atimeDesc, mtimeDesc, currentStat) {
    let stats;
    if (atimeDesc.tag === "no-change" || mtimeDesc.tag === "no-change") {
      stats = await currentStat();
    }

    const atime = this.#getNewTimestamp(atimeDesc, stats?.dataAccessTimestamp);
    const mtime = this.#getNewTimestamp(mtimeDesc, stats?.dataModificationTimestamp);
    return { atime, mtime };
  }

  /**
   * Return the handle that paths given to this descriptor are relative to
   *
   * WASI paths are always relative to a directory descriptor. The handle
   * resolves them beneath its directory, so that neither `..` nor symlinks
   * lead outside of it, whatever happens to the directory's own path
   *
   * @param {...string} paths The paths the operation is given
   * @returns {Promise<Dir>} The directory handle
   * @throws {FSError} `payload.tag` contains mapped WASI error code
   */
  async #directory(...paths: string[]): Promise<Dir> {
    if (!this.#isDirectory) {
      throw new FSError("not-directory");
    }

    for (const path of paths) {
      if (path.includes("\0")) {
        throw new FSError(process.platform === "win32" ? "no-entry" : "invalid");
      }
    }

    // A preopen is opened on its first use, as it is configured by path and
    // may not exist yet when it is configured. From then on it refers to the
    // directory that was found there
    if (!this.#dir) {
      const { Dir } = native();
      // The Windows preopen for every path is the root of the current drive
      const hostPath = this.#hostPreopen === "//" ? "/" : this.#hostPreopen;
      // Concurrent first uses share one open, and a failed one is retried
      this.#opening ??= Dir.promises.open(hostPath).finally(() => {
        this.#opening = undefined;
      });
      try {
        this.#dir ??= await this.#opening;
      } catch (e) {
        throw FSError.from(e);
      }
    }
    return this.#dir;
  }

  async #statForIdentity() {
    if (this.#isDirectory) {
      return (await this.#directory()).promises.stat();
    }
    this.#ensureHandle();
    return this.#sharedHandle.use((handle) => handle.stat());
  }

  #ensureHandle() {
    if (!this.#sharedHandle) {
      throw new FSError("bad-descriptor");
    }
  }

  #ensureWritable(data) {
    this.#ensureHandle();
    if (!this.#mode.write) {
      data?.[symbolDispose]?.();
      data?.close?.();
      throw new FSError("bad-descriptor");
    }
  }
}

const descriptorCreatePreopen = Descriptor._createPreopen;
delete Descriptor._createPreopen;

const descriptorCreate = Descriptor._create;
delete Descriptor._create;

/**
 * Convert a `new-timestamp` to the time a directory handle sets
 *
 * @param {object} timestamp The `new-timestamp`
 * @returns {NewTime} Nanoseconds since the epoch, or null for no change
 * @throws {FSError} If the timestamp's tag is unknown
 */
function newTime(timestamp): NewTime {
  switch (timestamp.tag) {
    case "now":
      // The JavaScript clock, so that "now" is the same instant everywhere in the host
      return BigInt(Date.now()) * 1_000_000n;
    case "no-change":
      return null;
    case "timestamp":
      return BigInt(timestamp.val.seconds) * NS_PER_SEC + BigInt(timestamp.val.nanoseconds);
    default:
      throw new FSError("invalid", `Unknown new-timestamp tag: ${timestamp.tag}`);
  }
}

/**
 * Convert a file type reported by a directory handle to a WASI `descriptor-type`
 *
 * @param {string} type The file type
 * @returns {object} The `descriptor-type`
 */
function descriptorType(type) {
  return type === "unknown" ? { tag: "other", val: undefined } : { tag: type };
}

/**
 * Build a WASI `descriptor-stat` from attributes reported by a directory handle
 *
 * @param {Stat} s The attributes
 * @returns {object} The `descriptor-stat`
 */
function descriptorStatFromHandle(s: Stat) {
  return {
    type: descriptorType(s.type),
    linkCount: s.nlink,
    size: s.size,
    dataAccessTimestamp: nsToDateTime(s.atimeNs),
    dataModificationTimestamp: nsToDateTime(s.mtimeNs),
    statusChangeTimestamp: nsToDateTime(s.ctimeNs),
  };
}

/**
 * Build an async iterator over values that become available together
 *
 * @template T
 * @param {Promise<T[]>} pending The values to yield, which must not reject
 * @returns {AsyncIterableIterator<T>} The iterator
 */
function iteratorOf(pending) {
  let index = 0;
  let done = false;
  return {
    async next() {
      const values = await pending;
      return !done && index < values.length
        ? { done: false, value: values[index++] }
        : { done: true, value: undefined };
    },
    async return(value) {
      done = true;
      return { done: true, value };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/**
 * Build a WASI `descriptor-stat` from Node.js file attributes
 *
 * @param {import("node:fs").BigIntStats} s The attributes
 * @returns {object} The `descriptor-stat`
 */
function descriptorStat(s) {
  return {
    type: wasiTypeFromDirent(s),
    linkCount: s.nlink,
    size: s.size,
    dataAccessTimestamp: nsToDateTime(s.atimeNs),
    dataModificationTimestamp: nsToDateTime(s.mtimeNs),
    statusChangeTimestamp: nsToDateTime(s.ctimeNs),
  };
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

const preopenEntries = [];
export const preopens = {
  Descriptor,
  getDirectories: () => preopenEntries,
};

export const types = {
  Descriptor,
};

/**
 * Set the preopen table.
 *
 * @param {Record<string, string>} entries
 */
export function _setPreopens(entries) {
  preopenEntries.length = 0;
  Object.entries(entries).forEach(([virtualPath, hostPreopen]) =>
    _addPreopen(virtualPath, hostPreopen),
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
