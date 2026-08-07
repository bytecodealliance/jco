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
    // The value assertion covers the futureTransfer intrinsic itself
    // (formerly an unimplemented stub that handed the receiving component
    // future rep [0]): the callee's sync-lifted
    // `make-future` returns a future written by a spawned task, the read
    // end is transferred to the caller on the fused return path, and the
    // caller awaits the value (seed + 1).
    test('composed component with cross-component future round trip', async () => {
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
            assert.strictEqual(await instance[EXPORT_NAME].runFutureTransfer(41), 42);
        } finally {
            await cleanup();
        }
    });
});
