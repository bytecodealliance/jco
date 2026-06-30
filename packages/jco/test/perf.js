import { join } from "node:path";
import { hrtime, env } from "node:process";

import { suite, test, assert } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "./helpers.js";
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from "./common.js";
import { composeCallerCallee } from "./p3/ported/wasmtime/component-async/common.js";

const ASYNC_G2G_CALL_LIMIT_NS = env.CI ? 50_000_000 : 40_000_000;

suite("performance", () => {
    // https://github.com/bytecodealliance/jco/issues/1711
    test.concurrent("guest->guest async call latency", async () => {
        // Build a combined component that will exercise the PrepareCall -> AsyncStartCall
        // path for guest->guest async calls
        const callerPath = join(LOCAL_TEST_COMPONENTS_DIR, "async-call-g2g-caller.wasm");
        const calleePath = join(LOCAL_TEST_COMPONENTS_DIR, "async-call-g2g-callee.wasm");
        const componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });

        // Transpile the composed component
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                },
                // jco: {
                //     transpile: {
                //         extraArgs: {
                //             minify: false,
                //         },
                //     },
                // },
            },
        });

        assert.instanceOf(instance["jco:test-components/local-run-async"].run, AsyncFunction);
        const runs = 1_000;
        for (var current = 0; current < runs; current++) {
            const before = hrtime();
            await instance["jco:test-components/local-run-async"].run();
            const [seconds, ns] = hrtime(before);
            assert.isBelow(
                seconds * 1e9 + ns,
                ASYNC_G2G_CALL_LIMIT_NS,
                `no run should take more than ${ASYNC_G2G_CALL_LIMIT_NS}ns`,
            );
        }
        await cleanup();
    });
});
