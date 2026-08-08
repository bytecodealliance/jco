import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
    ]);
}

// Regression test for wit-bindgen's inter-task-wakeup mechanism: when one
// guest task wakes another via a purely Rust-originating event (a Waker
// fired by a sibling component-model task), the sleeping task parks a
// guest-internal unit stream read in its waitable set and the waking task
// completes it with a unit write (wit-bindgen rt/async_support/
// inter_task_wakeup.rs, `inter-task-wakeup` feature).
//
// This also covers a detached (spawn_local) task holding an in-flight host
// import across an export-call boundary, with a subsequent export call on
// the same instance.
//
suite('guest inter-task wakeup', () => {
    test('detached pump task wakes a parked Rust waker across CM tasks', async () => {
        let resolveTick;
        const tickPromise = new Promise((resolve) => {
            resolveTick = resolve;
        });
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'inter-task-wakeup',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'inter-task-wakeup.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'wakeup-tick': { default: () => tickPromise },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncImports: ['wakeup-tick'],
                    },
                },
            },
        });
        try {
            assert.instanceOf(instance.startPump, AsyncFunction);
            assert.instanceOf(instance.awaitWake, AsyncFunction);

            // The export returns after spawning the pump, which remains
            // parked on the (unresolved) wakeup-tick import
            await withTimeout(instance.startPump(), 15_000, 'startPump');

            // A subsequent export call on the same instance parks on a
            // purely Rust-originating waker
            const wakePromise = instance.awaitWake();

            // Give the guest a moment to park before resolving the import
            await new Promise((r) => setTimeout(r, 250));
            resolveTick(42);

            assert.strictEqual(await withTimeout(wakePromise, 15_000, 'awaitWake'), 42);
        } finally {
            await cleanup();
        }
    }, 60_000);
});
