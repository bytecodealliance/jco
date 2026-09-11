import {
    _addPreopenWithAdapter,
    _clearPreopens,
    _setCwd,
    loadOpfsCapability,
    OpfsFilesystemAdapter,
} from "@bytecodealliance/preview2-shim/filesystem";
import { test as component } from "./component.js";

const SCRATCH_DIR = "opfs-e2e-scratch";

async function loadPreopen(dirHandle) {
    _clearPreopens();
    const capability = await loadOpfsCapability(dirHandle);
    const adapter = new OpfsFilesystemAdapter();
    _addPreopenWithAdapter("/", adapter, capability);
    _setCwd("/");
    return adapter;
}

// Runs the component's `run()` once against a live `OpfsFilesystemAdapter` to create
// content, flushes it to real OPFS storage, then reloads that same OPFS directory into a
// brand new adapter and runs `run()` again - proving writes and symlinks made across the
// component boundary actually survive in OPFS itself, rather than only in one adapter's
// in-memory tree.
export const test = {
    async run() {
        const opfsRoot = await navigator.storage.getDirectory();
        try {
            await opfsRoot.removeEntry(SCRATCH_DIR, { recursive: true });
        } catch {
            // nothing to clean up from a previous run
        }
        const dirHandle = await opfsRoot.getDirectoryHandle(SCRATCH_DIR, { create: true });

        try {
            const adapter = await loadPreopen(dirHandle);
            const writeResult = component.run();
            // Let the debounced automatic flush (scheduled on a microtask by the writes
            // above) settle before also flushing explicitly - otherwise the two race
            // against each other on the same OPFS handles.
            await new Promise((resolve) => setTimeout(resolve, 0));
            await adapter.flush();

            await loadPreopen(dirHandle);
            const readResult = component.run();

            return JSON.stringify({ writeResult, readResult });
        } finally {
            await opfsRoot.removeEntry(SCRATCH_DIR, { recursive: true });
        }
    },
};
export { test as "tests:p2-shim/test" };
