import type { FsPath, FsDirectoryEntry } from "../../24.x.x/fs/types.js";
import type { StorageRoot } from "./wasi-types.js";
import { path } from "./path.js";
import { fileType } from "./wasi-stats.js";
import { text } from "./wasi-errors.js";

/** Read directory snapshots while disposing every owned stream and descriptor. */
export function createWasiReaddir(root: StorageRoot, local: (value: FsPath) => string) {
  return function readdir(
    value: FsPath,
    recursive: boolean,
    withFileTypes: boolean,
  ): FsDirectoryEntry[] {
    const base = text(value);

    const result: FsDirectoryEntry[] = [];

    const pending = [base];
    while (pending.length) {
      const parentPath = pending.pop()!;

      const directory = root.descriptor.openAt(
        { symlinkFollow: true },
        local({ tag: "text", val: parentPath }),
        { directory: true },
        { read: true },
      );
      try {
        const stream = directory.readDirectory();
        try {
          for (;;) {
            const entry = stream.readDirectoryEntry();
            if (!entry) {
              break;
            }
            const childPath = path.join(parentPath, entry.name);
            result.push(
              withFileTypes
                ? {
                    tag: "dirent",
                    val: { name: entry.name, parentPath, fileType: fileType(entry.type) },
                  }
                : { tag: "name", val: path.relative(base, childPath) },
            );
            if (recursive && entry.type === "directory") {
              pending.push(childPath);
            }
          }
        } finally {
          stream[Symbol.dispose]();
        }
      } finally {
        directory[Symbol.dispose]();
      }
    }
    return result;
  };
}
