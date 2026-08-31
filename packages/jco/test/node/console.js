// End-to-end coverage for `node:console` in StarlingMonkey components.
import { assert, suite, test } from "vitest";

import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { componentizeFixture, exec, setupAsyncTest } from "../helpers.js";

suite("node:console in a component", () => {
    // TODO(unskip): use the published jco-std console exports once a release containing them is available.
    // StarlingMonkey also needs to finish componentizing the bundled console core within the
    // ten-minute integration budget. The direct host suite covers the opt-in Node passthrough meanwhile.
    test.skip("componentizes and runs default and custom consoles", async () => {
        const { componentPath, fixtureDir, stderr } = await componentizeFixture({
            fixture: "node-console",
            bundle: true,
        });
        assert.include(stderr, "Jco added generated WIT import jco:node/console@0.1.0");

        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-console", path: componentPath, skipInstantiation: true },
            jco: {
                transpile: {
                    extraArgs: {
                        map: {
                            "jco:node/console@0.1.0": pathToFileURL(
                                fileURLToPath(
                                    new URL(
                                        "../../../jco-std/dist/wasi/0.2.x/node/24.x.x/console-host-node.js",
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
