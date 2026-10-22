import { suite, test, assert } from "vitest";
import { BrowserLockManager } from "../../src/browser/opfs-filesystem.js";

/** Minimal in-memory stand-in for the OPFS FileSystemDirectoryHandle/FileSystemFileHandle API. */
class FakeFileHandle {
    kind = "file" as const;
    #bytes: Uint8Array;

    constructor(bytes: Uint8Array = new Uint8Array()) {
        this.#bytes = bytes;
    }

    async getFile() {
        const bytes = this.#bytes;
        return {
            arrayBuffer: async () => bytes.buffer,
            text: async () => new TextDecoder().decode(bytes),
        } as unknown as File;
    }

    async createWritable() {
        const chunks: Uint8Array[] = [];
        return {
            write: async (chunk: Uint8Array | string) => {
                chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
            },
            close: async () => {
                this.#bytes = chunks[0] ?? new Uint8Array();
            },
        };
    }
}

class FakeDirectoryHandle {
    kind = "directory" as const;
    entriesMap = new Map<string, FakeFileHandle | FakeDirectoryHandle>();
    name: string;

    constructor(name = "") {
        this.name = name;
    }

    async *entries(): AsyncIterableIterator<[string, FakeFileHandle | FakeDirectoryHandle]> {
        yield* this.entriesMap.entries();
    }

    async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        let handle = this.entriesMap.get(name);
        if (!handle) {
            if (!options?.create) {
                throw new DOMException("not found", "NotFoundError");
            }
            handle = new FakeDirectoryHandle();
            this.entriesMap.set(name, handle);
        }
        if (!(handle instanceof FakeDirectoryHandle)) {
            throw new Error(`"${name}" is not a directory`);
        }
        return handle;
    }

    async getFileHandle(name: string, options?: { create?: boolean }) {
        let handle = this.entriesMap.get(name);
        if (!handle) {
            if (!options?.create) {
                throw new DOMException("not found", "NotFoundError");
            }
            handle = new FakeFileHandle();
            this.entriesMap.set(name, handle);
        }
        if (!(handle instanceof FakeFileHandle)) {
            throw new Error(`"${name}" is not a file`);
        }
        return handle;
    }

    async removeEntry(name: string) {
        this.entriesMap.delete(name);
    }
}

function holdFirstWrite(file: FakeFileHandle) {
    const opened = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const createWritable = file.createWritable.bind(file);
    let writes = 0;
    let active = 0;
    let maxActive = 0;
    file.createWritable = async () => {
        const writable = await createWritable();
        const first = writes++ === 0;
        maxActive = Math.max(maxActive, ++active);
        opened.resolve();
        return {
            write: writable.write,
            close: async () => {
                if (first) {
                    await release.promise;
                }
                await writable.close();
                active--;
            },
        };
    };
    return {
        opened: opened.promise,
        release: release.resolve,
        active: () => active,
        maxActive: () => maxActive,
    };
}

suite("Browser OPFS filesystem adapter", () => {
    test("an explicit flush waits for an automatic write to close", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();
        const file = new FakeFileHandle();
        root.entriesMap.set("note.txt", file);
        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);
        const held = holdFirstWrite(file);
        const stream = descriptor.openAt({}, "note.txt", {}, { write: true }).writeViaStream(0n);
        stream.checkWrite();
        stream.write(new TextEncoder().encode("persisted"));
        await held.opened;

        let flushed = false;
        const flushing = adapter.flush().then(() => {
            flushed = true;
        });
        try {
            // Drain the fake handles' microtasks while the first writable remains open.
            await new Promise(setImmediate);
            assert.isFalse(flushed, "flush returned with an earlier writable still open");
            assert.strictEqual(held.maxActive(), 1, "flushes opened overlapping writables");
        } finally {
            held.release();
            await flushing;
            await adapter.dispose();
        }
        assert.strictEqual(held.active(), 0);
    });

    test("disposal waits for writes and cancels a queued automatic flush", async () => {
        const { createFilesystem } = await import("../../src/browser/filesystem.js");
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();
        const file = new FakeFileHandle();
        root.entriesMap.set("note.txt", file);
        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const filesystem = createFilesystem({ adapter, preopens: { "/": capability } });
        const [[descriptor]] = filesystem.preopens.getDirectories();
        const held = holdFirstWrite(file);
        const stream = descriptor.openAt({}, "note.txt", {}, { write: true }).writeViaStream(0n);
        stream.checkWrite();
        stream.write(new TextEncoder().encode("persisted"));

        let disposed = false;
        const disposal = filesystem.dispose();
        assert.strictEqual(filesystem.dispose(), disposal);
        const disposing = Promise.resolve(disposal).then(() => {
            disposed = true;
        });
        try {
            await held.opened;
            await new Promise(setImmediate);
            assert.isFalse(disposed, "dispose returned with a writable still open");
        } finally {
            held.release();
            await disposing;
        }
        assert.strictEqual(held.active(), 0);
        assert.strictEqual(held.maxActive(), 1, "the queued flush ran alongside disposal");
    });

    test.concurrent("loads OPFS content into a synchronous in-memory tree", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();
        root.entriesMap.set("greeting.txt", new FakeFileHandle(new TextEncoder().encode("hi")));

        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);

        assert.strictEqual(descriptor.statAt({}, "greeting.txt").size, 2n);
    });

    test.concurrent("flush persists in-memory writes back to OPFS", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();

        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);

        descriptor.createDirectoryAt("notes");
        const file = descriptor.openAt({}, "notes/todo.txt", { create: true }, { write: true });
        const stream = file.writeViaStream(0n);
        stream.checkWrite();
        stream.write(new TextEncoder().encode("buy milk"));

        await adapter.flush();

        const persistedDir = await root.getDirectoryHandle("notes");
        const persistedFile = await persistedDir.getFileHandle("todo.txt");
        const buffer = await (await persistedFile.getFile()).arrayBuffer();
        assert.strictEqual(new TextDecoder().decode(buffer), "buy milk");
    });

    test.concurrent("symlinks survive a flush + reload via the sidecar metadata file", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();
        root.entriesMap.set("target.txt", new FakeFileHandle(new TextEncoder().encode("hello")));

        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);
        descriptor.symlinkAt("target.txt", "link.txt");

        await adapter.flush();

        // The sidecar file isn't surfaced as a regular guest-visible entry.
        await root.getFileHandle(".__wasi_symlinks__.json");
        await adapter.dispose();
        const reloaded = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const reloadedAdapter = new OpfsFilesystemAdapter();
        const reloadedDescriptor = reloadedAdapter.getRoot(reloaded);

        assert.strictEqual(reloadedDescriptor.readlinkAt("link.txt"), "target.txt");
        assert.strictEqual(reloadedDescriptor.statAt({}, "link.txt").type, "symbolic-link");
        assert.strictEqual(reloadedDescriptor.statAt({ symlinkFollow: true }, "link.txt").size, 5n);

        // Removing the last symlink drops the now-empty sidecar file too.
        reloadedDescriptor.unlinkFileAt("link.txt");
        await reloadedAdapter.flush();
        let sidecarStillExists = true;
        try {
            await root.getFileHandle(".__wasi_symlinks__.json");
        } catch {
            sidecarStillExists = false;
        }
        assert.strictEqual(sidecarStillExists, false);
    });

    test.concurrent("a dangling symlink survives a flush + reload", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();

        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);
        descriptor.symlinkAt("missing-target.txt", "dangling-link.txt");

        assert.strictEqual(descriptor.statAt({}, "dangling-link.txt").type, "symbolic-link");
        assert.strictEqual(descriptor.readlinkAt("dangling-link.txt"), "missing-target.txt");

        const entries = descriptor.readDirectory();
        const names: string[] = [];
        for (
            let entry = entries.readDirectoryEntry();
            entry;
            entry = entries.readDirectoryEntry()
        ) {
            names.push(entry.name);
        }
        assert.deepStrictEqual(names, ["dangling-link.txt"]);

        await adapter.flush();

        await adapter.dispose();
        const reloaded = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const reloadedAdapter = new OpfsFilesystemAdapter();
        const reloadedDescriptor = reloadedAdapter.getRoot(reloaded);

        assert.strictEqual(
            reloadedDescriptor.statAt({}, "dangling-link.txt").type,
            "symbolic-link",
        );
        assert.strictEqual(
            reloadedDescriptor.readlinkAt("dangling-link.txt"),
            "missing-target.txt",
        );
    });

    test.concurrent("deleting and recreating a symlink round-trips through the sidecar", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();
        root.entriesMap.set("target.txt", new FakeFileHandle(new TextEncoder().encode("hello")));

        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);
        descriptor.symlinkAt("target.txt", "link.txt");
        await adapter.flush();

        descriptor.unlinkFileAt("link.txt");
        descriptor.symlinkAt("target.txt", "link.txt");
        await adapter.flush();

        await adapter.dispose();
        const reloaded = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const reloadedAdapter = new OpfsFilesystemAdapter();
        const reloadedDescriptor = reloadedAdapter.getRoot(reloaded);

        assert.strictEqual(reloadedDescriptor.readlinkAt("link.txt"), "target.txt");
        assert.strictEqual(reloadedDescriptor.statAt({}, "link.txt").type, "symbolic-link");
        assert.strictEqual(reloadedDescriptor.statAt({ symlinkFollow: true }, "link.txt").size, 5n);
    });

    test.concurrent("nested symlinks are recorded in a single root-level sidecar file, not one per directory", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();
        root.entriesMap.set("target.txt", new FakeFileHandle(new TextEncoder().encode("hello")));

        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);
        descriptor.createDirectoryAt("nested");
        const nested = descriptor.openAt({}, "nested", { directory: true }, { read: true });
        nested.symlinkAt("../target.txt", "link.txt");

        await adapter.flush();

        // No sidecar leaked into the nested directory itself.
        const nestedHandle = await root.getDirectoryHandle("nested");
        assert.strictEqual(nestedHandle.entriesMap.has(".__wasi_symlinks__.json"), false);

        const sidecar = await root.getFileHandle(".__wasi_symlinks__.json");
        const recorded = JSON.parse(await (await sidecar.getFile()).text());
        assert.deepStrictEqual(recorded, { "nested/link.txt": "../target.txt" });

        await adapter.dispose();
        const reloaded = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const reloadedAdapter = new OpfsFilesystemAdapter();
        const reloadedDescriptor = reloadedAdapter.getRoot(reloaded);
        const reloadedNested = reloadedDescriptor.openAt(
            {},
            "nested",
            { directory: true },
            { read: true },
        );
        assert.strictEqual(reloadedNested.readlinkAt("link.txt"), "../target.txt");
        assert.strictEqual(
            reloadedDescriptor.statAt({ symlinkFollow: true }, "nested/link.txt").size,
            5n,
        );
    });

    test.concurrent("mutations persist to OPFS automatically without an explicit flush() call", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const root = new FakeDirectoryHandle();

        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);

        const file = descriptor.openAt({}, "note.txt", { create: true }, { write: true });
        const stream = file.writeViaStream(0n);
        stream.checkWrite();
        stream.write(new TextEncoder().encode("auto"));

        // No explicit flush()/dispose() call - persistence is scheduled on a microtask;
        // yield to a macrotask so the async write chain it kicks off can finish.
        await new Promise((resolve) => setTimeout(resolve, 0));

        const persisted = await root.getFileHandle("note.txt");
        const buffer = await (await persisted.getFile()).arrayBuffer();
        assert.strictEqual(new TextDecoder().decode(buffer), "auto");
    });

    test.concurrent("cross-tab locking is off by default and opt-in via navigator.locks", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const requests: Array<{ name: string; mode: string }> = [];
        const fakeNavigator = {
            request: (name: string, options: { mode: string }, callback: () => Promise<void>) => {
                requests.push({ name, mode: options.mode });
                return Promise.resolve(callback());
            },
        } as BrowserLockManager;

        const root = new FakeDirectoryHandle("sandbox");
        root.entriesMap.set("file.txt", new FakeFileHandle());
        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);

        const defaultAdapter = new OpfsFilesystemAdapter();
        const defaultDescriptor = defaultAdapter.getRoot(capability) as any;
        defaultDescriptor.openAt({}, "file.txt", {}, { read: true }).tryLockShared();
        assert.strictEqual(requests.length, 0);

        const optedIn = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const lockingAdapter = new OpfsFilesystemAdapter({ lockManager: fakeNavigator });
        const lockingDescriptor = lockingAdapter.getRoot(optedIn) as any;
        const opened = lockingDescriptor.openAt({}, "file.txt", {}, { read: true });
        assert.strictEqual(opened.tryLockExclusive(), true);

        assert.strictEqual(requests.length, 1);
        assert.strictEqual(requests[0].mode, "exclusive");
        assert.strictEqual(requests[0].name, "sandbox/file.txt");
    });

    // Regression coverage for a bug found while integrating this adapter into application:
    // `withCrossTabLocking` wraps every descriptor returned by a cross-tab-locking-enabled
    // adapter in a `Proxy`. `InMemoryFilesystemAdapter#renameAt`/`#isSameObject` reach into a
    // *second* descriptor argument with raw private-field access (`descriptor.#entry`), which
    // bypasses `Proxy` traps and fails its brand check - throwing a `TypeError` instead of
    // renaming/comparing. In the real component this surfaced as a silently hung `mv` command
    // (the guest's rename call never returned), not a catchable error.
    test.concurrent("renameAt works when the destination descriptor is lock-wrapped", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const fakeNavigator = {
            request: (_name: string, _options: { mode: string }, callback: () => Promise<void>) =>
                Promise.resolve(callback()),
        } as BrowserLockManager;

        const root = new FakeDirectoryHandle("sandbox");
        root.entriesMap.set("old.txt", new FakeFileHandle(new TextEncoder().encode("hi")));
        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);

        const adapter = new OpfsFilesystemAdapter({ lockManager: fakeNavigator });
        const cwd = adapter.getRoot(capability) as any;
        // Two separate lock-wrapped handles onto the same directory, as a guest issuing
        // `mv old.txt new.txt` would produce (one descriptor to resolve each path against).
        const sourceDir = cwd.openAt({}, ".", { directory: true }, {});
        const destDir = cwd.openAt({}, ".", { directory: true }, {});

        sourceDir.renameAt("old.txt", destDir, "new.txt");

        assert.strictEqual(cwd.statAt({}, "new.txt").size, 2n);
    });

    test.concurrent("isSameObject works when comparing lock-wrapped descriptors", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } =
            await import("../../src/browser/opfs-filesystem.js");
        const fakeNavigator = {
            request: (_name: string, _options: { mode: string }, callback: () => Promise<void>) =>
                Promise.resolve(callback()),
        } as BrowserLockManager;

        const root = new FakeDirectoryHandle("sandbox");
        root.entriesMap.set("file.txt", new FakeFileHandle());
        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);

        const adapter = new OpfsFilesystemAdapter({ lockManager: fakeNavigator });
        const cwd = adapter.getRoot(capability) as any;
        const a = cwd.openAt({}, "file.txt", {}, { read: true });
        const b = cwd.openAt({}, "file.txt", {}, { read: true });

        assert.strictEqual(a.isSameObject(b), true);
    });
});
