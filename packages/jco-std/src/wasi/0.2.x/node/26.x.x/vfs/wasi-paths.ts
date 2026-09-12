import { path } from "./path.js";
import { createEACCES, createEINVAL, createELOOP } from "./errors.js";
import type { Preopen, StorageRoot } from "./wasi-types.js";

/** Choose the longest preopen mount containing the requested VFS root. */
export function resolveStorageRoot(rootPath: string, preopens: readonly Preopen[]): StorageRoot {
  const candidates = preopens
    .filter(([, mount]) => {
      const normalized = path.resolve("/", mount);
      return (
        rootPath === normalized || rootPath.startsWith(normalized === "/" ? "/" : normalized + "/")
      );
    })
    .sort((a, b) => path.resolve("/", b[1]).length - path.resolve("/", a[1]).length);
  const selected = candidates[0];
  if (!selected) {
    throw createEACCES("open", rootPath);
  }
  return {
    descriptor: selected[0],
    directory: path.relative(path.resolve("/", selected[1]), rootPath) || ".",
  };
}

export function validateStorageRoot(root: StorageRoot): StorageRoot {
  if (!root || typeof root.directory !== "string" || !root.descriptor) {
    throw createEINVAL("open");
  }
  const normalized = path.normalize(root.directory);
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw createEACCES("open", root.directory);
  }
  return { descriptor: root.descriptor, directory: normalized };
}

/** Resolve links within the selected preopen, retaining a finite symlink budget. */
export function realpathWithin(root: StorageRoot, relative: string): string {
  const segments = relative.split("/").filter(Boolean);

  const resolved: string[] = [];

  let links = 0;
  while (segments.length) {
    const segment = segments.shift()!;
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (!resolved.length) {
        throw createEACCES("realpath", relative);
      }
      resolved.pop();
      continue;
    }
    const local = path.join(root.directory, ...resolved, segment);

    const stats = root.descriptor.statAt({}, local);
    if (stats.type !== "symbolic-link") {
      resolved.push(segment);
      continue;
    }
    if (++links > 40) {
      throw createELOOP("realpath", relative);
    }
    const target = root.descriptor.readlinkAt(local);
    if (path.isAbsolute(target)) {
      throw createEACCES("realpath", relative);
    }
    segments.unshift(...target.split("/"));
  }
  return resolved.join("/");
}
