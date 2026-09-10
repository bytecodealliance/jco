import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { componentize } from "@bytecodealliance/componentize-js";
import { transpile } from "@bytecodealliance/jco";
import { assert, beforeAll, suite, test } from "vitest";

import {
    FIXTURES_WIT_DIR,
    getTmpDir,
    runBasicHarnessPageTest,
    startTestServer,
} from "../common.js";

suite("browser OPFS filesystem adapter from a component", () => {
    let results: { writeResult: string; readResult: string };

    beforeAll(async () => {
        const outDir = await getTmpDir();
        let harness: Awaited<ReturnType<typeof startTestServer>> | undefined;
        try {
            const { component } = await componentize({
                sourcePath: fileURLToPath(
                    new URL("../fixtures/browser/opfs-filesystem/component.js", import.meta.url),
                ),
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-fs-write",
            });
            const { files } = await transpile(component, {
                name: "component",
                optimize: false,
                outDir,
            });
            for (const [path, bytes] of Object.entries(files)) {
                await mkdir(dirname(path), { recursive: true });
                await writeFile(path, bytes);
            }
            // Runs the component's `run()` once against a live `OpfsFilesystemAdapter` to
            // create content, flushes it to real OPFS storage, then reloads that same OPFS
            // directory into a brand new adapter and runs `run()` again - proving writes and
            // symlinks made across the component boundary actually survive in OPFS itself,
            // rather than only in one adapter's in-memory tree.
            await writeFile(
                join(outDir, "configured.js"),
                `import { _addPreopenWithAdapter, _clearPreopens, _setCwd, loadOpfsCapability, OpfsFilesystemAdapter } from "@bytecodealliance/preview2-shim/filesystem";
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
                             // Let the debounced automatic flush (scheduled on a microtask by the
                             // writes above) settle before also flushing explicitly - otherwise the
                             // two race against each other on the same OPFS handles.
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
                 export { test as "tests:p2-shim/test" };`,
            );
            harness = await startTestServer({ transpiledOutputDir: outDir });
            const { statusJSON } = await runBasicHarnessPageTest({
                browser: harness.browser,
                url: `${harness.baseURL}/index.html#transpiled:configured.js`,
            });
            results = JSON.parse(statusJSON.msg!);
        } finally {
            if (harness) {
                await harness.cleanup();
            } else {
                await rm(outDir, { recursive: true, force: true });
            }
        }
    }, 120_000);

    test.concurrent("first run creates files, symlinks, and a marker under OPFS", () => {
        assert.strictEqual(results.writeResult, "write:ok");
    });

    test.concurrent("second run confirms writes and symlinks survived a flush + reload", () => {
        assert.strictEqual(results.readResult, "read:ok");
    });
});
