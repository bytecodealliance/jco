import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hrtime, env } from 'node:process';
import { fileURLToPath } from 'node:url';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { parse } from '../src/wasm-tools.js';
import { setupAsyncTest, composeCallerCallee } from './helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from './common.js';

const ASYNC_G2G_CALL_LIMIT_NS = env.CI ? 70_000_000 : 40_000_000;
// Initial bounds leave room for CI variance over the ratios measured when this
// test was introduced. These should narrow as call overhead improves.
const WASM_MODULE_CALL_OVERHEAD_RATIO_LIMIT = 10;
const SYNC_COMPONENT_CALL_OVERHEAD_RATIO_LIMIT = 1_000;
const ASYNC_COMPONENT_CALL_OVERHEAD_RATIO_LIMIT = 8_000;
const ADDER_COMPONENT_PATH = fileURLToPath(new URL('./fixtures/components/adder.component.wasm', import.meta.url));
const ADDER_MODULE_PATH = fileURLToPath(new URL('./fixtures/runtime/adder.wat', import.meta.url));

function nativeAdd(a: number, b: number) {
    return (a + b) | 0;
}

function median(values: number[]) {
    const sorted = values.toSorted((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function measureSyncCall(call: (a: number, b: number) => number, calls: number) {
    const samples = [];
    let result = 0;
    for (let sample = 0; sample < 5; sample++) {
        const start = hrtime.bigint();
        for (let i = 0; i < calls; i++) {
            result = call(i, 1);
        }
        samples.push(Number(hrtime.bigint() - start) / calls);
    }
    assert.strictEqual(result, calls);
    return median(samples);
}

async function measureAsyncCall(call: (a: number, b: number) => Promise<number>, calls: number) {
    const samples = [];
    let result = 0;
    for (let sample = 0; sample < 5; sample++) {
        const start = hrtime.bigint();
        for (let i = 0; i < calls; i++) {
            result = await call(i, 1);
        }
        samples.push(Number(hrtime.bigint() - start) / calls);
    }
    assert.strictEqual(result, calls);
    return median(samples);
}

suite('performance', () => {
    // https://github.com/bytecodealliance/jco/issues/1717
    test.skipIf(typeof WebAssembly?.Suspending !== 'function')(
        'native/module/component export call overhead',
        async () => {
            const moduleBytes = await parse(await readFile(ADDER_MODULE_PATH, 'utf8'));
            const module = await WebAssembly.instantiate(moduleBytes);
            const moduleAdd = module.instance.exports.add as (a: number, b: number) => number;
            const sync = await setupAsyncTest({ component: { path: ADDER_COMPONENT_PATH } });
            const async = await setupAsyncTest({
                component: {
                    path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-flat-param-adder.wasm'),
                    imports: new WASIShim().getImportObject(),
                },
            });

            try {
                const syncAdd = sync.instance.add.add;
                const asyncAdd = async.instance.asyncAddS32.add;

                // Warm all four paths before sampling so compilation does not count as call overhead.
                measureSyncCall(nativeAdd, 10_000);
                measureSyncCall(moduleAdd, 10_000);
                measureSyncCall(syncAdd, 10_000);
                await measureAsyncCall(asyncAdd, 100);

                const nativeNs = measureSyncCall(nativeAdd, 1_000_000);
                const moduleNs = measureSyncCall(moduleAdd, 1_000_000);
                const syncComponentNs = measureSyncCall(syncAdd, 100_000);
                const asyncComponentNs = await measureAsyncCall(asyncAdd, 1_000);
                const moduleRatio = moduleNs / nativeNs;
                const syncComponentRatio = syncComponentNs / nativeNs;
                const asyncComponentRatio = asyncComponentNs / nativeNs;

                assert.isBelow(
                    moduleRatio,
                    WASM_MODULE_CALL_OVERHEAD_RATIO_LIMIT,
                    `sync Wasm module call overhead should remain below ${WASM_MODULE_CALL_OVERHEAD_RATIO_LIMIT}x native`,
                );
                assert.isBelow(
                    syncComponentRatio,
                    SYNC_COMPONENT_CALL_OVERHEAD_RATIO_LIMIT,
                    `sync component call overhead should remain below ${SYNC_COMPONENT_CALL_OVERHEAD_RATIO_LIMIT}x native`,
                );
                assert.isBelow(
                    asyncComponentRatio,
                    ASYNC_COMPONENT_CALL_OVERHEAD_RATIO_LIMIT,
                    `async component call overhead should remain below ${ASYNC_COMPONENT_CALL_OVERHEAD_RATIO_LIMIT}x native`,
                );
            } finally {
                await Promise.all([sync.cleanup(), async.cleanup()]);
            }
        },
    );

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
