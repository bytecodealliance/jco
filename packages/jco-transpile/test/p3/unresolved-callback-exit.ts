import { join } from 'node:path';

import { assert, expect, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

async function unresolvedExitTrap(call: () => unknown) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const error = await Promise.race([
            Promise.resolve()
                .then(call)
                .then(
                    () => assert.fail('an unresolved callback exit must reject'),
                    (err) => err,
                ),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('the call stayed pending')), 2_000);
            }),
        ]);
        assert.instanceOf(error, WebAssembly.RuntimeError);
        assert.match(error.message, /without resolution/);
    } finally {
        clearTimeout(timer);
    }
}

suite.skipIf(typeof WebAssembly.Suspending !== 'function')('unresolved callback exits', () => {
    test.concurrent.each(['exitImmediately', 'exitAfterYield'])('%s rejects and poisons its store', async (name) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `unresolved-callback-${name}`,
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'unresolved-callback-exit.wasm'),
                imports: { ...new WASIShim().getImportObject() },
            },
        });
        try {
            await unresolvedExitTrap(() => instance[name]());
            await expect(Promise.resolve().then(() => instance.returnThenExit())).rejects.toBeInstanceOf(
                WebAssembly.RuntimeError,
            );
        } finally {
            await cleanup();
        }
    });

    test('the SDK still delivers task.return before a normal callback exit', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'resolved-callback-exit',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'unresolved-callback-exit.wasm'),
                imports: { ...new WASIShim().getImportObject() },
            },
        });
        try {
            assert.strictEqual(await instance.returnThenExit(), 42);
        } finally {
            await cleanup();
        }
    });

    test('a caller exiting with a moved-stream subtask STARTED traps instead of idling', async () => {
        const path = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'unresolved-exit-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'unresolved-exit-g2g-callee.wasm'),
        });
        const packed: number[] = [];
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'unresolved-composed-exit',
                path,
                imports: {
                    ...new WASIShim().getImportObject(),
                    progress: { default: (value: number) => packed.push(value) },
                },
            },
        });
        try {
            await unresolvedExitTrap(() => instance.run());
            assert.deepEqual(packed, [0x11], 'the subtask reuses the moved-out readable handle');
            await expect(Promise.resolve().then(() => instance.ok())).rejects.toBeInstanceOf(WebAssembly.RuntimeError);
        } finally {
            await cleanup();
        }
    });
});
