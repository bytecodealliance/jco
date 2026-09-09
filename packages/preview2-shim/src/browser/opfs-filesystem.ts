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

async function readEntries(handle: FileSystemDirectoryHandle): Promise<Record<string, FileDataEntry>> {
    const dir: Record<string, FileDataEntry> = {};
    for await (const [name, child] of (handle as IterableDirectoryHandle).entries()) {
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
    for await (const [name] of (handle as IterableDirectoryHandle).entries()) {
        if (!seen.has(name)) {
            await handle.removeEntry(name, { recursive: true });
        }
    }
    for (const [name, entry] of Object.entries(dir)) {
        if (entry.symlink !== undefined) {
            // OPFS has no native symlink concept; symlinks stay in-memory only
            // for the lifetime of this capability.
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
    return { handle, data: { dir: await readEntries(handle) } };
}

/**
 * Browser filesystem adapter backed by the Origin Private File System.
 *
 * Every guest-facing `Descriptor` operation is delegated to `InMemoryFilesystemAdapter`
 * and stays synchronous. Persistence to OPFS only happens at the edges: load the
 * tree once via `loadOpfsCapability`, then call `flush()` (or `dispose()`) to write
 * the accumulated in-memory changes back out.
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
        await Promise.all(this.#roots.map((root) => writeEntries(root.handle, root.data.dir ?? {})));
    }

    dispose(): void {
        void this.flush();
    }
}
