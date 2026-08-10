import { join } from 'node:path';

import { afterAll, assert, beforeAll, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

const EXPORT_NAME = 'jco:test-components/stream-transfer-runner';

suite('guest->guest stream transfer', () => {
    let instance;
    let cleanup;

    beforeAll(async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-transfer-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-transfer-g2g-callee.wasm'),
        });
        ({ instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stream-transfer-g2g',
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
        }));
    });

    afterAll(async () => {
        await cleanup?.();
    });

    // Regression test: the return-position stream transfer of a fused
    // *sync* guest->guest call runs after the callee task's teardown has
    // already cleared the per-component current-task register
    // (_symmetricSyncGuestCallExit), so streamTransfer must not derive its
    // context from that register (it previously threw
    // 'missing global current task'). Per the Canonical ABI the transfer is
    // a pure table operation between the source and destination components.
    //
    // The caller does a *bounded* read of the three values: a sync-lifted
    // export cannot leave detached work behind, so the callee's writer gets
    // exactly one inline poll (registering the pending write, which the
    // caller's read rendezvouses with) and the stream never reaches close.
    // wasmtime behaves identically for this shape.
    test('sync call: stream in return position across a composition', async () => {
        assert.instanceOf(instance[EXPORT_NAME].runStreamTransfer, AsyncFunction);
        // callee writes [seed, seed+1, seed+2]; caller sums them
        assert.strictEqual(await instance[EXPORT_NAME].runStreamTransfer(7), 7 + 8 + 9);
    });

    // Regression test for the async-lifted shape of "return a stream, then
    // keep writing": the callee task stays alive after returning the stream
    // (callback protocol) until its writer spawned via `spawn_local`
    // completes, so the writable end drops, the transferred stream reaches
    // close, and the caller's collect() terminates. Verified to match
    // wasmtime 47 (`--invoke run-stream-transfer-all(7)` returns 24).
    test('async call: stream read to close across a composition', async () => {
        assert.instanceOf(instance[EXPORT_NAME].runStreamTransferAll, AsyncFunction);
        // callee writes [seed, seed+1, seed+2] then closes; caller sums them
        assert.strictEqual(await instance[EXPORT_NAME].runStreamTransferAll(7), 7 + 8 + 9);
    });
});
