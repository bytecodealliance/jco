import { join } from 'node:path';
import { hrtime, env } from 'node:process';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest, composeCallerCallee } from './helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from './common.js';

const ASYNC_G2G_CALL_LIMIT_NS = env.CI ? 50_000_000 : 40_000_000;

suite('performance', () => {
    // https://github.com/bytecodealliance/jco/issues/1711
    test('guest->guest async call latency', { retry: 5 }, async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }

        // Build a combined component that will exercise the PrepareCall -> AsyncStartCall
        // path for guest->guest async calls
        const callerPath = join(LOCAL_TEST_COMPONENTS_DIR, 'async-call-g2g-caller.wasm');
        const calleePath = join(LOCAL_TEST_COMPONENTS_DIR, 'async-call-g2g-callee.wasm');
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

        assert.ok(instance['jco:test-components/local-run-async'].run instanceof AsyncFunction);
        const runs = 1_000;
        for (let current = 0; current < runs; current++) {
            const before = hrtime();
            await instance['jco:test-components/local-run-async'].run();
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
