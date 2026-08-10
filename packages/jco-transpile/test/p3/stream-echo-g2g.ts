import { join } from 'node:path';

import { afterAll, assert, beforeAll, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

const EXPORT_NAME = 'jco:test-components/stream-echo-runner';

suite('guest->guest stream echo pumps', () => {
    let instance;
    let cleanup;

    beforeAll(async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-echo-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-echo-g2g-callee.wasm'),
        });
        ({ instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stream-echo-g2g',
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

    // The callee's echo pump parks a read on the argument stream before the
    // caller's first write; the write must rendezvous with the parked
    // cross-component read and wake it, and the echoed values must flow
    // back until close. Caller writes [seed, seed+1, seed+2]; the pump
    // echoes each value +1.
    test('echo pump across a composition', async () => {
        assert.instanceOf(instance[EXPORT_NAME].runStreamEcho, AsyncFunction);
        assert.strictEqual(await instance[EXPORT_NAME].runStreamEcho(7), 8 + 9 + 10);
    });

    // Regression test for execution-slot deadlock
    //
    // make-source's task legally outlives its return (its adopted writer
    // pump stays parked), and  make-echo then enters the same component
    // while it is still live.
    //
    // Task entry must be governed by backpressure + the per-slice exclusive lock,
    // not serialized on the previous task's exit -- otherwise make-echo never runs,
    // the source's writer never finds a reader, and both components poll their waitable
    // sets forever.
    //
    // The source stream's read end is also transferred out of the callee (return position)
    // and straight back in (argument position), leaving both of its ends inside the callee.,
    //
    // Verified to match wasmtime 47 (`--invoke run-stream-relay(7)` returns 27).
    test('relay through two live callee tasks', async () => {
        assert.instanceOf(instance[EXPORT_NAME].runStreamRelay, AsyncFunction);
        assert.strictEqual(await instance[EXPORT_NAME].runStreamRelay(7), 8 + 9 + 10);
    });
});
