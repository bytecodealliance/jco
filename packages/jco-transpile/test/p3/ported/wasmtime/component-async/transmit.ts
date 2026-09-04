import assert from 'node:assert';
import { join } from 'node:path';

import { suite, test } from 'vitest';

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from './common.js';

async function yieldTimes(count) {
    for (let i = 0; i < count; i++) {
        await Promise.resolve();
    }
}

async function* values(items) {
    yield* items;
}

async function collect(stream) {
    const result = [];
    for await (const item of stream) {
        result.push(item);
    }
    return result;
}

async function runTransmit(instance) {
    const control = values([
        { tag: 'read-stream', val: 'a' },
        { tag: 'read-future', val: 'b' },
        { tag: 'write-stream', val: 'c' },
        { tag: 'write-future', val: 'd' },
    ]);
    const never = new Promise(() => {});

    const [calleeStream, calleeFuture1] = await instance.transmit.exchange(
        control,
        values(['a']),
        Promise.resolve('b'),
        never,
    );

    const [streamValues, futureValue] = await Promise.all([collect(calleeStream), calleeFuture1]);
    assert.deepStrictEqual(streamValues, ['c']);
    assert.strictEqual(futureValue, 'd');
}

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/transmit.rs
//
suite('transmit scenario', () => {
    test('callee & caller', async () => {
        let cleanup;

        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, 'p3/general/async-transmit-caller.wasm');
            const calleePath = join(COMPONENT_FIXTURES_DIR, 'p3/general/async-transmit-callee.wasm');
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

            const res = await buildAndTranspile({
                componentPath,
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            await instance['local:local/run'].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test('callee', async () => {
        let cleanup;

        try {
            const componentPath = join(COMPONENT_FIXTURES_DIR, 'p3/general/async-transmit-callee.wasm');
            const res = await buildAndTranspile({
                componentPath,
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            await runTransmit(instance);
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test('readiness', async () => {
        let cleanup;

        try {
            const componentPath = join(COMPONENT_FIXTURES_DIR, 'p3/general/async-readiness.wasm');
            const res = await buildAndTranspile({
                componentPath,
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            const expected = new Uint8Array([2, 4, 6, 8, 9]);
            let delivered = false;
            const input = {
                [Symbol.asyncIterator]() {
                    return this;
                },
                async next() {
                    if (delivered) {
                        return { value: undefined, done: true };
                    }
                    await yieldTimes(10);
                    delivered = true;
                    // Match Wasmtime's BufferStreamProducer: write the complete
                    // numeric buffer and report the producer dropped in one poll.
                    return { value: expected, done: true };
                },
            };

            const [output, returnedExpected] = await instance.readiness.start(input, expected);
            await yieldTimes(10);
            const outputResult = await output.read({
                count: returnedExpected.length,
                dropAfterCopy: true,
            });
            assert.strictEqual(outputResult.done, false);
            assert.deepStrictEqual(outputResult.value, returnedExpected);
            assert.deepStrictEqual(await output.next(), { value: undefined, done: true });
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
