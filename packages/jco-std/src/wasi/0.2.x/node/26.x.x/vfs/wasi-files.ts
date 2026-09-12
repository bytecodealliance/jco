import { Buffer as NodeBuffer } from "node:buffer";
import { systemError } from "../../24.x.x/errors/core.js";
import { O_APPEND, O_CREAT, O_EXCL, O_RDWR, O_TRUNC, O_WRONLY } from "../../24.x.x/fs/constants.js";
import type {
  FsPath,
  FsPathOrDescriptor,
  FsOpenMode,
  FsReadResult,
} from "../../24.x.x/fs/types.js";
import type { Descriptor, StorageRoot } from "./wasi-types.js";
import { createEBADF, createEINVAL } from "./errors.js";

interface OpenFile {
  descriptor: Descriptor;

  position: bigint;

  append: boolean;
}

function openFlags(mode: FsOpenMode): {
  create: boolean;

  exclusive: boolean;

  truncate: boolean;

  read: boolean;

  write: boolean;

  append: boolean;
} {
  if (mode.tag === "number") {
    return {
      create: !!(mode.val & O_CREAT),
      exclusive: !!(mode.val & O_EXCL),
      truncate: !!(mode.val & O_TRUNC),
      read: !(mode.val & O_WRONLY),
      write: !!(mode.val & (O_WRONLY | O_RDWR)),
      append: !!(mode.val & O_APPEND),
    };
  }
  const flag = mode.val;
  if (
    !["r", "r+", "rs", "rs+", "w", "wx", "w+", "wx+", "a", "ax", "a+", "ax+", "as", "as+"].includes(
      flag,
    )
  ) {
    throw createEINVAL("open", flag);
  }
  return {
    create: flag.startsWith("w") || flag.startsWith("a"),
    exclusive: flag.includes("x"),
    truncate: flag.startsWith("w"),
    read: flag.startsWith("r") || flag.includes("+"),
    write: !flag.startsWith("r") || flag.includes("+"),
    append: flag.startsWith("a"),
  };
}

/** Own the descriptors and offsets for one VFS root. */
export function createWasiFiles(root: StorageRoot, local: (value: FsPath) => string) {
  const opened = new Map<number, OpenFile>();

  let nextFd = 1;
  function file(fd: number): OpenFile {
    const entry = opened.get(fd);
    if (!entry) {
      throw createEBADF("open");
    }
    return entry;
  }

  function open(value: FsPath, flags: FsOpenMode): number {
    const selected = openFlags(flags);

    const descriptor = root.descriptor.openAt(
      { symlinkFollow: true },
      local(value),
      selected,
      selected,
    );
    const fd = nextFd++;
    opened.set(fd, { descriptor, position: 0n, append: selected.append });
    return fd;
  }

  function close(fd: number): void {
    file(fd).descriptor[Symbol.dispose]();
    opened.delete(fd);
  }

  function withFile<T>(value: FsPathOrDescriptor, flag: string, operation: (fd: number) => T): T {
    if (value.tag === "descriptor") {
      return operation(value.val);
    }
    const fd = open(value.val, { tag: "symbolic", val: flag });
    try {
      return operation(fd);
    } finally {
      close(fd);
    }
  }

  function read(fd: number, length: number, position?: bigint): FsReadResult {
    const entry = file(fd);

    const offset = position ?? entry.position;

    const [data] = entry.descriptor.read(BigInt(length), offset);
    if (position === undefined) {
      entry.position += BigInt(data.length);
    }
    return { bytesRead: data.length, data };
  }

  function write(fd: number, data: Uint8Array, position?: bigint): number {
    const entry = file(fd);

    const offset = entry.append ? entry.descriptor.stat().size : (position ?? entry.position);

    const count = entry.descriptor.write(data, offset);
    if (position === undefined) {
      entry.position = offset + count;
    }
    return Number(count);
  }

  function readFile(value: FsPathOrDescriptor, flag = "r"): Uint8Array {
    return withFile(value, flag, (fd) => {
      const chunks: Uint8Array[] = [];
      for (;;) {
        const result = read(fd, 65536);
        if (!result.bytesRead) {
          break;
        }
        chunks.push(result.data);
      }
      return NodeBuffer.concat(chunks);
    });
  }

  function writeFile(
    value: FsPathOrDescriptor,
    data: Uint8Array,
    flag: string,
    flush: boolean,
  ): void {
    withFile(value, flag, (fd) => {
      let written = 0;
      while (written < data.length) {
        const count = write(fd, data.subarray(written));
        if (!count) {
          throw systemError({ code: "EIO", message: "VFS write made no progress" });
        }
        written += count;
      }
      if (flush) {
        file(fd).descriptor.sync();
      }
    });
  }

  return { file, open, close, withFile, read, write, readFile, writeFile };
}
