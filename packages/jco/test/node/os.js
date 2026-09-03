import { readFile, writeFile } from "node:fs/promises";
import nativeOs from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assert, expect, suite, test } from "vitest";

import { OS_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { componentizeFixture, exec, getTmpDir, setupAsyncTest } from "../helpers.js";

suite("node:os in a component", () => {
    test.concurrent("installs the typed OS WIT dependency idempotently", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:os;\nworld component {}\n");

        const result = await injectNodeWitImports(root, undefined, [OS_WIT_REQUIREMENT]);
        expect(result?.imports).toEqual(["jco:node/os@0.1.0"]);
        const osWit = await readFile(join(root, "deps/jco-node-0.1.0/os.wit"), "utf8");
        expect(osWit).toContain("interface os");
        expect(osWit).toContain("record cpu-info");
        expect(osWit).toContain("network-interfaces: func(");
        expect(await injectNodeWitImports(root, undefined, [OS_WIT_REQUIREMENT])).toBeUndefined();
        expect((await readFile(world, "utf8")).match(/import jco:node\/os@0\.1\.0;/g)).toHaveLength(1);
    });

    // TODO(unskip): enable after a jco-std release includes the node:os package exports.
    test.skip("componentizes and reads the real host through the opt-in Node adapter", async () => {
        const { componentPath, fixtureDir, stderr } = await componentizeFixture({
            fixture: "node-os",
            bundle: true,
        });
        assert.include(stderr, "Jco added generated WIT import jco:node/os@0.1.0");

        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-os", path: componentPath, skipInstantiation: true },
            jco: {
                transpile: {
                    extraArgs: {
                        map: {
                            "jco:node/os@0.1.0": pathToFileURL(
                                fileURLToPath(
                                    new URL(
                                        "../../../jco-std/dist/wasi/0.2.x/node/24.x.x/os-host-node.js",
                                        import.meta.url,
                                    ),
                                ),
                            ).href,
                        },
                    },
                },
            },
        });

        try {
            const output = await exec(join(fixtureDir, "run.js"), esModuleOutputPath);
            const report = JSON.parse(output.stdout);
            assert.strictEqual(report.namespaceIdentity, true);
            assert.strictEqual(report.arch, nativeOs.arch());
            assert.strictEqual(report.platform, nativeOs.platform());
            assert.isAbove(report.parallelism, 0);
            assert.strictEqual(report.username, nativeOs.userInfo().username);
            assert.strictEqual(report.homedir, nativeOs.homedir());
            assert.strictEqual(report.eol, nativeOs.EOL);
            assert.strictEqual(report.devNull, nativeOs.devNull);
        } finally {
            await cleanup();
        }
    }, 600_000);
});
