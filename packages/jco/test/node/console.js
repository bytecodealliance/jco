// End-to-end coverage for `node:console` in StarlingMonkey components.
import { assert, suite, test } from "vitest";

import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { componentizeFixture, exec, setupAsyncTest } from "../helpers.js";

/** jco-std's Node host adapter, which an application must opt into explicitly. */
const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console/host/node");

suite("node:console in a component", () => {
    // The bundled console core must componentize within the ten-minute integration budget.
    test("componentizes and runs default and custom consoles", async () => {
        const { componentPath, outputDir, fixtureDir, stderr } = await componentizeFixture({
            fixture: "node-console",
            bundle: true,
            copy: true,
        });
        assert.include(stderr, "Jco added generated WIT import jco:node/console@0.1.0");

        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-console", path: componentPath, outputDir, skipInstantiation: true },
            jco: {
                transpile: {
                    extraArgs: {
                        map: {
                            "jco:node/console@0.1.0": NODE_HOST,
                        },
                    },
                },
            },
        });

        await symlink(
            fileURLToPath(new URL("../../node_modules", import.meta.url)),
            join(outputDir, "node_modules"),
            "dir",
        );

        try {
            const output = await exec(join(fixtureDir, "run.js"), esModuleOutputPath, NODE_HOST);
            assert.strictEqual(output.stderr, "guest stderr\n");
            assert.strictEqual(
                output.stdout,
                'guest stdout 24\nguest: 1\ngroup\n  nested\nRESULT:"custom stdout\\n|custom stderr\\nAssertion failed: assertion 1\\n"\n',
            );
        } finally {
            await cleanup();
        }
    }, 600_000);
});
