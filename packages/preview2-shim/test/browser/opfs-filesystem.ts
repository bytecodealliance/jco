import { suite, test, assert } from "vitest";

/** Minimal in-memory stand-in for the OPFS FileSystemDirectoryHandle/FileSystemFileHandle API. */
class FakeFileHandle {
    kind = "file" as const;
    #bytes: Uint8Array;

    constructor(bytes: Uint8Array = new Uint8Array()) {
        this.#bytes = bytes;
    }

    async getFile() {
        const bytes = this.#bytes;
        return { arrayBuffer: async () => bytes.buffer } as unknown as File;
    }

    async createWritable() {
        const chunks: Uint8Array[] = [];
        return {
            write: async (chunk: Uint8Array) => {
                chunks.push(chunk);
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

suite("Browser OPFS filesystem adapter", () => {
    test("loads OPFS content into a synchronous in-memory tree", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } = await import(
            "../../src/browser/opfs-filesystem.js"
        );
        const root = new FakeDirectoryHandle();
        root.entriesMap.set("greeting.txt", new FakeFileHandle(new TextEncoder().encode("hi")));

        const capability = await loadOpfsCapability(root as unknown as FileSystemDirectoryHandle);
        const adapter = new OpfsFilesystemAdapter();
        const descriptor = adapter.getRoot(capability);

        assert.strictEqual(descriptor.statAt({}, "greeting.txt").size, 2n);
    });

    test("flush persists in-memory writes back to OPFS", async () => {
        const { loadOpfsCapability, OpfsFilesystemAdapter } = await import(
            "../../src/browser/opfs-filesystem.js"
        );
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
});
