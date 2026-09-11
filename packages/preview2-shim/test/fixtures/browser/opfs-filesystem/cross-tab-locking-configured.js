import {
    loadOpfsCapability,
    OpfsFilesystemAdapter,
} from "@bytecodealliance/preview2-shim/filesystem";

const SCRATCH_DIR = "opfs-cross-tab-e2e-scratch";

function check(condition, message) {
    if (!condition) {
        throw message;
    }
}

async function waitUntil(predicate, { timeout = 5000, interval = 20 } = {}) {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
        if (await predicate()) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return false;
}

async function isHeldExclusive(lockName) {
    const { held } = await navigator.locks.query();
    return held.some((lock) => lock.name === lockName && lock.mode === "exclusive");
}

async function isPending(lockName) {
    const { pending } = await navigator.locks.query();
    return pending.some((lock) => lock.name === lockName);
}

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
            // Two independent adapters/trees over the same OPFS directory, simulating two
            // tabs: each has its own same-process lock domain, coordinated only through the
            // real navigator.locks, which a browser shares across same-origin tabs (and,
            // here, contexts).
            const capabilityA = await loadOpfsCapability(dirHandle);
            const adapterA = new OpfsFilesystemAdapter({ lockManager: navigator.locks });
            const rootA = adapterA.getRoot(capabilityA);
            const setup = rootA.openAt({}, "shared.txt", { create: true }, { write: true });
            setup.write(new TextEncoder().encode("x"), 0n);
            // Let the debounced automatic flush (scheduled on a microtask by the write
            // above) settle before also flushing explicitly - otherwise the two race on the
            // same OPFS handles - then await the explicit flush itself, so no write is
            // still in flight when cleanup below removes the scratch directory (which OPFS
            // rejects).
            await new Promise((resolve) => setTimeout(resolve, 0));
            await adapterA.flush();

            const lockName = `${dirHandle.name}/shared.txt`;
            const fileA = rootA.openAt({}, "shared.txt", {}, { read: true });
            check(fileA.tryLockExclusive() === true, "adapter A failed its local lock check");

            check(
                await waitUntil(() => isHeldExclusive(lockName)),
                "real navigator.locks grant for adapter A never appeared",
            );

            // Adapter B doesn't share adapter A's same-process lock state, so its *local*
            // check succeeds immediately...
            const capabilityB = await loadOpfsCapability(dirHandle);
            const adapterB = new OpfsFilesystemAdapter({ lockManager: navigator.locks });
            const rootB = adapterB.getRoot(capabilityB);
            const fileB = rootB.openAt({}, "shared.txt", {}, { read: true });
            const localResultB = fileB.tryLockExclusive();

            // ...but its real cross-tab request queues behind adapter A's, because the
            // browser's navigator.locks is shared by both.
            const queuedWhileHeld = await waitUntil(() => isPending(lockName));

            fileA.unlock();

            const grantedAfterRelease = await waitUntil(
                async () => !(await isPending(lockName)) && (await isHeldExclusive(lockName)),
            );

            fileB.unlock();

            return JSON.stringify({ localResultB, queuedWhileHeld, grantedAfterRelease });
        } finally {
            await opfsRoot.removeEntry(SCRATCH_DIR, { recursive: true });
        }
    },
};
export { test as "tests:p2-shim/test" };
