import type { FsHost, FsPath } from "../../24.x.x/fs/types.js";
import type { HostImports } from "../../24.x.x/internal/wit-types.js";
import { createVfs } from "./core.js";
import type { VfsModule } from "./core.js";
import { path } from "./path.js";
import { createEACCES } from "./errors.js";
import { resolveStorageRoot, validateStorageRoot, realpathWithin } from "./wasi-paths.js";
import { wasiStats } from "./wasi-stats.js";
import { createWasiFiles } from "./wasi-files.js";
import { createWasiReaddir } from "./wasi-directory.js";
import { unsupported, text, timestamp, wasiErrorCode, wrapWasiHost } from "./wasi-errors.js";
import type { WasiVfsOptions } from "./wasi-types.js";

export type { Descriptor, Preopen, StorageRoot, WasiVfsOptions } from "./wasi-types.js";
export { resolveStorageRoot } from "./wasi-paths.js";

/**
 * One FsHost per VFS root. The resolver chooses storage once, on the first host
 * operation. Preopens are borrowed; descriptors and directory streams are owned
 * and disposed by the operation or the corresponding virtual file handle.
 */
function createWasiHost(rootPath: string, options: WasiVfsOptions): HostImports<FsHost> {
  const root = validateStorageRoot(
    (options.resolveRoot ?? resolveStorageRoot)(rootPath, options.preopens.getDirectories()),
  );

  function relative(value: FsPath): string {
    const fullPath = path.normalize(text(value));

    const result = path.relative(rootPath, fullPath);
    if (result === ".." || result.startsWith("../")) {
      throw createEACCES("open", fullPath);
    }
    return result;
  }

  function local(value: FsPath): string {
    return path.join(root.directory, relative(value));
  }

  const { file, open, close, withFile, read, write, readFile, writeFile } = createWasiFiles(
    root,
    local,
  );

  const readdir = createWasiReaddir(root, local);

  const host: HostImports<FsHost> = {
    access(value, mode) {
      root.descriptor.statAt({ symlinkFollow: true }, local(value));
      if (mode !== 0) {
        unsupported();
      }
    },
    appendFile: (value, data, opts) => writeFile(value, data, opts.flag ?? "a", opts.flush),
    writeFile: (value, data, opts) => writeFile(value, data, opts.flag ?? "w", opts.flush),
    readFile: (value, opts) => readFile(value, opts.flag),
    close,
    open: (value, flags) => open(value, flags),
    read,
    write,
    readdir: (value, opts) => readdir(value, opts.recursive, opts.withFileTypes),
    exists(value) {
      try {
        root.descriptor.statAt({ symlinkFollow: true }, local(value));
        return true;
      } catch (error) {
        if (wasiErrorCode(error) === "no-entry" || wasiErrorCode(error) === "not-directory") {
          return false;
        }
        throw error;
      }
    },
    stat(value, opts) {
      try {
        return wasiStats(
          root.descriptor.statAt({ symlinkFollow: true }, local(value)),
          opts.bigint,
        );
      } catch (error) {
        if (wasiErrorCode(error) === "no-entry" && !opts.throwIfNoEntry) {
          return undefined;
        }
        throw error;
      }
    },
    lstat(value, opts) {
      try {
        return wasiStats(root.descriptor.statAt({}, local(value)), opts.bigint);
      } catch (error) {
        if (wasiErrorCode(error) === "no-entry" && !opts.throwIfNoEntry) {
          return undefined;
        }
        throw error;
      }
    },
    fstat: (fd, opts) => wasiStats(file(fd).descriptor.stat(), opts.bigint),
    ftruncate: (fd, length) => file(fd).descriptor.setSize(BigInt(length)),
    truncate: (value, length) =>
      withFile({ tag: "path", val: value }, "r+", (fd) =>
        file(fd).descriptor.setSize(BigInt(length)),
      ),
    fsync: (fd) => file(fd).descriptor.sync(),
    fdatasync: (fd) => file(fd).descriptor.syncData(),
    futimes: (fd, atime, mtime) => file(fd).descriptor.setTimes(timestamp(atime), timestamp(mtime)),
    utimes: (value, atime, mtime) =>
      root.descriptor.setTimesAt(
        { symlinkFollow: true },
        local(value),
        timestamp(atime),
        timestamp(mtime),
      ),
    lutimes: (value, atime, mtime) =>
      root.descriptor.setTimesAt({}, local(value), timestamp(atime), timestamp(mtime)),
    readlink: (value) => root.descriptor.readlinkAt(local(value)),
    realpath: (value) => path.join(rootPath, realpathWithin(root, relative(value))),
    unlink: (value) => root.descriptor.unlinkFileAt(local(value)),
    rmdir: (value) => root.descriptor.removeDirectoryAt(local(value)),
    rename: (source, destination) =>
      root.descriptor.renameAt(local(source), root.descriptor, local(destination)),
    link: (source, destination) =>
      root.descriptor.linkAt({}, local(source), root.descriptor, local(destination)),
    symlink(target, value) {
      const targetPath = text(target);

      const stored = path.isAbsolute(targetPath)
        ? path.relative(path.dirname(local(value)), local(target))
        : targetPath;
      root.descriptor.symlinkAt(stored, local(value));
    },
    mkdir(value, opts) {
      const target = local(value);
      if (!opts.recursive) {
        root.descriptor.createDirectoryAt(target);
        return undefined;
      }
      let current = ".";

      let first: string | undefined;
      for (const part of target.split("/")) {
        current = path.join(current, part);
        try {
          root.descriptor.createDirectoryAt(current);
          first ??= path.join(rootPath, path.relative(root.directory, current));
        } catch (error) {
          if (
            wasiErrorCode(error) !== "exist" ||
            root.descriptor.statAt({ symlinkFollow: true }, current).type !== "directory"
          ) {
            throw error;
          }
        }
      }
      return first;
    },
    copyFile(source, destination, mode) {
      if (mode & ~1) {
        unsupported();
      }
      writeFile(
        { tag: "path", val: destination },
        readFile({ tag: "path", val: source }),
        mode & 1 ? "wx" : "w",
        false,
      );
    },
    readv(fd, lengths, position) {
      const buffers: Uint8Array[] = [];

      let bytesRead = 0;
      for (const length of lengths) {
        const result = read(
          fd,
          length,
          position === undefined ? undefined : position + BigInt(bytesRead),
        );
        buffers.push(result.data);
        bytesRead += result.bytesRead;
        if (result.bytesRead < length) {
          break;
        }
      }
      return { bytesRead, buffers };
    },
    writev(fd, buffers, position) {
      let bytesWritten = 0;
      for (const buffer of buffers) {
        bytesWritten += write(
          fd,
          buffer,
          position === undefined ? undefined : position + BigInt(bytesWritten),
        );
      }
      return bytesWritten;
    },
    chmod: unsupported,
    chown: unsupported,
    fchmod: unsupported,
    fchown: unsupported,
    lchown: unsupported,
    statfs: unsupported,
    cp: unsupported,
    glob: unsupported,
    mkdtemp: unsupported,
    rm: unsupported,
  };

  return wrapWasiHost(host);
}

export function createWasiVfs(options: WasiVfsOptions): VfsModule {
  return createVfs((rootPath) => createWasiHost(rootPath, options));
}
