import assert from 'node:assert';
import { join } from 'node:path';

import { beforeAll, suite, test } from 'vitest';

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from './common.js';

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/transmit.rs
// (`test_cancel`, `test_cancel_trap`, and `test_synchronous_transmit`)

async function yieldTimes(count) {
    for (let i = 0n; i < count; i++) {
        await Promise.resolve();
    }
}

suite('cancel scenario', () => {
    let componentPath;

    beforeAll(async () => {
        const callerPath = join(COMPONENT_FIXTURES_DIR, 'p3/cancellation/async-cancel-caller.wasm');
        const calleePath = join(COMPONENT_FIXTURES_DIR, 'p3/cancellation/async-cancel-callee.wasm');
        componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });
    });

    async function runCancel(mode) {
        let cleanup;
        try {
            const longYield = new Promise(() => {});
            const cancelYieldTimes = async (count) => {
                if (count > 100n) {
                    await longYield;
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 0));
            };
            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        'local:local/yield': { yieldTimes: cancelYieldTimes },
                    },
                },
            });
            cleanup = res.cleanup;

            await res.instance['local:local/cancel'].run({ tag: mode }, 100n);
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    }

    test('normal', async () => {
        await runCancel('normal');
        await runCancel('leak-task-after-cancel');
    });

    test('trap', async () => {
        for (const mode of [
            'trap-cancel-guest-after-start-cancelled',
            'trap-cancel-guest-after-return-cancelled',
            'trap-cancel-guest-after-return',
            'trap-cancel-host-after-return-cancelled',
            'trap-cancel-host-after-return',
        ]) {
            await assert.rejects(runCancel(mode), /`subtask\.cancel` called after terminal status delivered/);
        }
    });

    test('cancel transmit', async () => {
        const componentPath = join(COMPONENT_FIXTURES_DIR, 'p3/cancellation/async-cancel-transmit.wasm');
        let cleanup;
        try {
            const res = await buildAndTranspile({ componentPath });
            const instance = res.instance;
            cleanup = res.cleanup;

            const streamExpected = new Uint8Array([2, 4, 6, 8, 9]);
            const streamGate = Promise.withResolvers();
            let streamDelivered = false;
            const inputStream = {
                [Symbol.asyncIterator]() {
                    return this;
                },
                async next() {
                    if (streamDelivered) {
                        return { value: undefined, done: true };
                    }
                    await streamGate.promise;
                    await yieldTimes(10n);
                    streamDelivered = true;
                    return { value: streamExpected, done: true };
                },
            };

            const futureExpected = 10;
            const futureGate = Promise.withResolvers();
            const inputFuture = futureGate.promise.then(async () => {
                await yieldTimes(10n);
                return futureExpected;
            });

            const [outputStream, returnedStreamExpected, outputFuture, returnedFutureExpected] = await instance[
                'local:local/synchronous-transmit'
            ].start(inputStream, streamExpected, inputFuture, futureExpected);

            const outputRead = outputStream.read({
                count: returnedStreamExpected.length,
                dropAfterCopy: true,
            });
            streamGate.resolve();
            futureGate.resolve();

            const [streamResult, futureResult] = await Promise.all([outputRead, outputFuture]);
            assert.deepStrictEqual(streamResult.value, returnedStreamExpected);
            assert.strictEqual(streamResult.done, false);
            assert.strictEqual(futureResult, returnedFutureExpected);
            assert.deepStrictEqual(await outputStream.next(), { value: undefined, done: true });
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
