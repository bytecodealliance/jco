import { assert, expect, suite, test } from "vitest";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DNS_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { componentizeFixture, exec, getTmpDir, setupAsyncTest } from "../helpers.js";

suite("node:dns in a component", () => {
    test("installs the DNS WIT dependency without duplicating it", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:dns;\nworld component {}\n");
        const result = await injectNodeWitImports(root, undefined, [DNS_WIT_REQUIREMENT]);
        expect(result?.imports).toEqual(["jco:node/dns@0.1.0"]);
        expect(await readFile(join(root, "deps/jco-node-0.1.0/dns.wit"), "utf8")).toContain("interface dns");
        expect(await injectNodeWitImports(root, undefined, [DNS_WIT_REQUIREMENT])).toBeUndefined();
        expect((await readFile(world, "utf8")).match(/import jco:node\/dns@0\.1\.0;/g)).toHaveLength(1);
    });

    // TODO(unskip): use the published jco-std DNS exports once a release containing them is available.
    test.skip("componentizes both DNS specifiers and calls the opt-in Node host", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-dns",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey"],
        });
        assert.include(stderr, "Jco added generated WIT import jco:node/dns@0.1.0");

        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            asyncMode: "jspi",
            component: { name: "node-dns", path: componentPath, skipInstantiation: true },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncImports: ["jco:node/dns@0.1.0#query"],
                        asyncExports: ["run"],
                        map: {
                            "jco:node/dns@0.1.0": pathToFileURL(
                                fileURLToPath(
                                    new URL(
                                        "../../../jco-std/dist/wasi/0.2.x/node/24.x.x/dns-host-node.js",
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
            const runner = fileURLToPath(new URL("../fixtures/componentize/node-dns/run.js", import.meta.url));
            const output = await exec(runner, esModuleOutputPath);
            const report = JSON.parse(output.stdout);
            assert.isAtLeast(report.serverCount, 0);
            assert.strictEqual(report.namespaceIdentity, true);
            assert.strictEqual(report.promisesIdentity, true);
            assert.strictEqual(report.resultOrder, "ipv4first");
            assert.strictEqual(report.cancelCode, "ERR_JCO_UNSUPPORTED_NODE_API");
        } finally {
            await cleanup();
        }
    }, 600_000);
});
