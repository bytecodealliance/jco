import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

const OPFS_FIXTURES_DIR = fileURLToPath(
    new URL("../fixtures/browser/opfs-filesystem/", import.meta.url),
);

suite("browser OPFS filesystem adapter from a component", () => {
    let results: { writeResult: string; readResult: string };

    beforeAll(async () => {
        const outDir = await getTmpDir();
        let harness: Awaited<ReturnType<typeof startTestServer>> | undefined;
        try {
            const { component } = await componentize({
                sourcePath: `${OPFS_FIXTURES_DIR}component.js`,
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
            await copyFile(
                `${OPFS_FIXTURES_DIR}persistence-configured.js`,
                `${outDir}/configured.js`,
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

suite("browser OPFS cross-tab locking via real navigator.locks", () => {
    let results: { localResultB: boolean; queuedWhileHeld: boolean; grantedAfterRelease: boolean };

    beforeAll(async () => {
        // No wasm component is involved here - this exercises the shim's browser API
        // (OpfsFilesystemAdapter, real navigator.locks/OPFS) directly, rather than the
        // wasi:filesystem ABI, which the suite above already covers.
        const outDir = await getTmpDir();
        let harness: Awaited<ReturnType<typeof startTestServer>> | undefined;
        try {
            await copyFile(
                `${OPFS_FIXTURES_DIR}cross-tab-locking-configured.js`,
                `${outDir}/configured.js`,
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
    }, 60_000);

    test.concurrent("adapter B's local lock check succeeds independently of adapter A", () => {
        assert.strictEqual(results.localResultB, true);
    });

    test.concurrent("adapter B's real cross-tab request queues while adapter A holds the lock", () => {
        assert.strictEqual(results.queuedWhileHeld, true);
    });

    test.concurrent("adapter B's real cross-tab request is granted after adapter A unlocks", () => {
        assert.strictEqual(results.grantedAfterRelease, true);
    });
});
