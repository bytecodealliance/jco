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

suite("browser filesystem symlinks from a component", () => {
    let results: Record<string, string>;

    beforeAll(async () => {
        const outDir = await getTmpDir();
        let harness: Awaited<ReturnType<typeof startTestServer>> | undefined;
        try {
            const { component } = await componentize({
                sourcePath: fileURLToPath(
                    new URL(
                        "../fixtures/browser/filesystem-symlinks/component.js",
                        import.meta.url,
                    ),
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
            // Configure the host, then let all operations and assertions cross
            // the component boundary. In particular, do not call descriptors here.
            await writeFile(
                join(outDir, "configured.js"),
                `import { _setFileData, _setCwd } from "@bytecodealliance/preview2-shim/filesystem";
                 _setFileData({ dir: {
                     work: { dir: {} },
                     target: { source: "value" },
                     absolute: { symlink: "/target" }
                 } });
                 _setCwd("/work");
                 export const { test } = await import("./component.js");
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

    for (const name of [
        "follow and no-follow",
        "intermediate symlink chains",
        "directory entries and metadata",
        "hard links and unlink",
        "cyclic links",
        "create dangling target",
        "exclusive create",
        "missing target parent",
        "relative parent target",
        "dot target with configured cwd",
        "absolute preset target",
        "readlink absolute preset target",
        "create through relative target chain",
        "parent-relative directory mutations",
    ]) {
        test.concurrent(name, () => {
            assert.strictEqual(results[name], "ok", `${name}: ${results[name]}`);
        });
    }
});
