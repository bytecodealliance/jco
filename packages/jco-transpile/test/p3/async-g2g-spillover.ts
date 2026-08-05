import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { setupAsyncTest, composeCallerCallee } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

// Regression tests for guest->guest async calls through a composition whose
// flat param count exceeds MAX_FLAT_ASYNC_PARAMS (4): the caller's async
// lower spills its arguments to memory (passing a single pointer), while
// the async-lifted callee still receives up to MAX_FLAT_PARAMS (16) flat
// params. The fused [async-start] adapter converts between the two;
// _asyncStartCall previously asserted the two counts were equal and threw
// 'unexpected callee param count [1], expected [5]'.
//
// See lann/jco#14
suite('guest->guest async calls with spilled params', () => {
    test('5 x u32 params through a composition', async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'async-g2g-spillover-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'async-g2g-spillover-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'async-g2g-spillover',
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    pause: { default: () => Promise.resolve() },
                },
            },
            jco: { transpile: { extraArgs: { asyncImports: ['pause'] } } },
        });
        try {
            assert.instanceOf(instance.runAdd5, AsyncFunction);
            assert.strictEqual(await instance.runAdd5(1, 2, 3, 4, 5), 15);
        } finally {
            await cleanup();
        }
    });

    test('(string, string, u8) params through a composition', async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'async-g2g-spillover-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'async-g2g-spillover-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'async-g2g-spillover',
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    pause: { default: () => Promise.resolve() },
                },
            },
            jco: { transpile: { extraArgs: { asyncImports: ['pause'] } } },
        });
        try {
            assert.instanceOf(instance.runConcat3, AsyncFunction);
            assert.strictEqual(await instance.runConcat3('héllo ', 'wörld ', 7), 'héllo wörld 7');
        } finally {
            await cleanup();
        }
    });

    // The callee parks (awaits a host import) before returning, so its
    // result is delivered by the guest->guest driver loop rather than the
    // callee's initial synchronous slice. Previously the driver-loop call in
    // _asyncStartCall referenced undefined `resolve`/`reject` identifiers;
    // the resulting ReferenceError was swallowed by the surrounding catch,
    // so eagerly-resolving callees appeared to work while any callee that
    // parked never resumed.
    test('multi-slice callee (parks on a host import) through a composition', async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'async-g2g-spillover-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'async-g2g-spillover-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'async-g2g-spillover',
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    pause: {
                        default: () => new Promise((resolve) => setTimeout(resolve, 10)),
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncImports: ['pause'],
                    },
                },
            },
        });
        try {
            assert.instanceOf(instance.runAdd5Parked, AsyncFunction);
            const result = await Promise.race([
                instance.runAdd5Parked(1, 2, 3, 4, 5),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout: parked callee never resumed')), 15_000),
                ),
            ]);
            assert.strictEqual(result, 15);
        } finally {
            await cleanup();
        }
    });
});
