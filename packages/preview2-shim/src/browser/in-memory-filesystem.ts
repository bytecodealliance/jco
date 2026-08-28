import type { BrowserFilesystemAdapter, FileData } from "./filesystem.js";

/** Explicit ephemeral storage adapter for browser applications and tests. */
export class InMemoryFilesystemAdapter implements BrowserFilesystemAdapter<FileData> {
    getRoot(capability: FileData): FileData {
        if (!capability.dir) {
            throw new TypeError("an in-memory preopen root must be a directory");
        }
        return capability;
    }
}
