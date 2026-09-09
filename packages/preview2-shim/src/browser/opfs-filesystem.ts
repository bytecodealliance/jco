import type { BrowserFilesystemAdapter, BrowserFilesystemDescriptor } from "./filesystem.js";
import { InMemoryFilesystemAdapter } from "./in-memory-filesystem.js";
import type { FileData, FileDataEntry } from "./in-memory-filesystem.js";

/**
 * A directory handle paired with the in-memory tree it was loaded into.
 * `getRoot` hands the `data` half straight to `InMemoryFilesystemAdapter`, so every
 * guest-visible filesystem operation stays fully synchronous; only the initial load
 * and the explicit `flush`/`dispose` round-trip to OPFS are async.
 */
export interface OpfsCapability {
    handle: FileSystemDirectoryHandle;
    data: FileData;
}

// FileSystemDirectoryHandle is async-iterable per spec, but TypeScript's DOM lib
// doesn't declare `entries()` yet.
type IterableDirectoryHandle = FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
};

// OPFS has no native symlink concept. All symlinks under a root are recorded in a
// single hidden sidecar file at that root, keyed by their path relative to it, so
// they survive a flush + reload instead of only living for the lifetime of one
// capability.
const SYMLINKS_FILE = ".__wasi_symlinks__.json";

async function readSymlinksFile(handle: FileSystemDirectoryHandle): Promise<Record<string, string>> {
    try {
        const fileHandle = await handle.getFileHandle(SYMLINKS_FILE);
        const file = await fileHandle.getFile();
        return JSON.parse(await file.text());
    } catch {
        return {};
    }
}

async function writeSymlinksFile(
    handle: FileSystemDirectoryHandle,
    symlinks: Record<string, string>,
): Promise<void> {
    if (Object.keys(symlinks).length === 0) {
        try {
            await handle.removeEntry(SYMLINKS_FILE);
        } catch {
            // no sidecar to remove
        }
        return;
    }
    const fileHandle = await handle.getFileHandle(SYMLINKS_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(symlinks));
    await writable.close();
}

/** Collect every symlink under `dir` into a flat path -> target map, relative to `dir` itself. */
function collectSymlinks(dir: Record<string, FileDataEntry>, prefix: string, out: Record<string, string>): void {
    for (const [name, entry] of Object.entries(dir)) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (entry.symlink !== undefined) {
            out[path] = entry.symlink;
        } else if (entry.dir) {
            collectSymlinks(entry.dir, path, out);
        }
    }
}

/** Place each recorded symlink back into the tree at its path, skipping any path whose parent is missing. */
function injectSymlinks(root: Record<string, FileDataEntry>, symlinks: Record<string, string>): void {
    for (const [path, target] of Object.entries(symlinks)) {
        const parts = path.split("/").filter(Boolean);
        const name = parts.pop();
        if (!name) {
            continue;
        }
        let dir: Record<string, FileDataEntry> | undefined = root;
        for (const part of parts) {
            dir = dir[part]?.dir;
            if (!dir) {
                break;
            }
        }
        if (dir && !(name in dir)) {
            dir[name] = { symlink: target };
        }
    }
}

async function readEntries(handle: FileSystemDirectoryHandle): Promise<Record<string, FileDataEntry>> {
    const dir: Record<string, FileDataEntry> = {};
    for await (const [name, child] of (handle as IterableDirectoryHandle).entries()) {
        if (name === SYMLINKS_FILE) {
            continue;
        }
        if (child.kind === "directory") {
            dir[name] = { dir: await readEntries(child) };
        } else {
            const file = await (child as FileSystemFileHandle).getFile();
            dir[name] = { source: new Uint8Array(await file.arrayBuffer()) };
        }
    }
    return dir;
}

async function writeEntries(handle: FileSystemDirectoryHandle, dir: Record<string, FileDataEntry>): Promise<void> {
    const seen = new Set(Object.keys(dir));
    seen.add(SYMLINKS_FILE);
    for await (const [name] of (handle as IterableDirectoryHandle).entries()) {
        if (!seen.has(name)) {
            await handle.removeEntry(name, { recursive: true });
        }
    }
    for (const [name, entry] of Object.entries(dir)) {
        if (entry.symlink !== undefined) {
            // Recorded separately in the root's symlink sidecar file.
            continue;
        }
        if (entry.dir) {
            await writeEntries(await handle.getDirectoryHandle(name, { create: true }), entry.dir);
            continue;
        }
        const fileHandle = await handle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        const source = entry.source ?? new Uint8Array();
        const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
        await writable.write(bytes.slice());
        await writable.close();
    }
}

/** Load an OPFS directory into an in-memory tree, ready to hand to `OpfsFilesystemAdapter.getRoot`. */
export async function loadOpfsCapability(handle: FileSystemDirectoryHandle): Promise<OpfsCapability> {
    const dir = await readEntries(handle);
    injectSymlinks(dir, await readSymlinksFile(handle));
    return { handle, data: { dir } };
}

/**
 * Browser filesystem adapter backed by the Origin Private File System.
 *
 * Every guest-facing `Descriptor` operation - including advisory locking, which
 * comes for free as `InMemoryFilesystemAdapter`'s same-process reader/writer lock -
 * is delegated to `InMemoryFilesystemAdapter` and stays synchronous. Persistence to
 * OPFS only happens at the edges: load the tree once via `loadOpfsCapability`, then
 * call `flush()` (or `dispose()`) to write the accumulated in-memory changes back
 * out, including symlinks via a single hidden sidecar file at each root.
 */
export class OpfsFilesystemAdapter implements BrowserFilesystemAdapter<OpfsCapability> {
    #inMemory = new InMemoryFilesystemAdapter();
    #roots: OpfsCapability[] = [];

    getRoot(capability: OpfsCapability): BrowserFilesystemDescriptor {
        this.#roots.push(capability);
        return this.#inMemory.getRoot(capability.data);
    }

    /** Persist every loaded root's current in-memory state back to OPFS. */
    async flush(): Promise<void> {
        await Promise.all(
            this.#roots.map(async (root) => {
                const dir = root.data.dir ?? {};
                await writeEntries(root.handle, dir);
                const symlinks: Record<string, string> = {};
                collectSymlinks(dir, "", symlinks);
                await writeSymlinksFile(root.handle, symlinks);
            }),
        );
    }

    dispose(): void {
        void this.flush();
    }
}
