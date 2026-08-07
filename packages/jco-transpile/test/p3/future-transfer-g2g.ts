import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

const EXPORT_NAME = 'jco:test-components/future-transfer-runner';

suite('guest->guest future transfer', () => {
    // Regression test: a future crossing the component-component boundary of
    // a composed component generates a `future.transfer` trampoline, whose
    // `const trampoline{N} = futureTransfer;` definition must be emitted
    // before the instantiation code that references it (like the
    // corresponding `stream.transfer` trampoline already is), otherwise
    // instantiation in `instantiation: 'async'` mode (the default used by
    // setupAsyncTest) throws:
    //   ReferenceError: Cannot access 'trampolineN' before initialization
    //
    // NOTE: this test only asserts successful instantiation and export
    // shape. Actually *calling* runFutureTransfer does not work yet: the
    // futureTransfer intrinsic is currently a stub that returns undefined
    // (the receiving component then traps on future rep [0]). Once future
    // transfer is implemented, this test should be extended to assert
    // `await instance[EXPORT_NAME].runFutureTransfer(41) === 42`.
    test('composed component with cross-component future instantiates', async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'future-transfer-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'future-transfer-g2g-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'future-transfer-g2g',
                path: componentPath,
                imports: { ...new WASIShim().getImportObject() },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });
        try {
            assert.instanceOf(instance[EXPORT_NAME].runFutureTransfer, AsyncFunction);
        } finally {
            await cleanup();
        }
    });
});
