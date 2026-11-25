import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const CANNOT_BLOCK = /cannot block a synchronous task before returning/;

/**
 * Instantiate `sync-call-blocks-beside-host-wait.wat`, whose host import
 * `pending` settles only when the test cleans up.
 *
 * @param name - a name for the transpiled output
 * @returns the instance and its cleanup
 */
async function setup(name: string) {
    let settlePending!: () => void;
    const pending = new Promise<void>((resolve) => {
        settlePending = resolve;
    });
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: {
            name,
            path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-call-blocks-beside-host-wait.wat'),
            imports: { pending: { default: () => pending } },
        },
    });
    return {
        instance,
        cleanup: async () => {
            settlePending();
            await cleanup();
        },
    };
}

/**
 * Settle with how a call ended, or report that it is still pending.
 *
 * @param call - the call
 * @param ms - how long to wait for it
 * @returns the error the call failed with, or `'pending'`
 */
async function outcome(call: Promise<unknown>, ms: number): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('pending'), ms);
    });
    try {
        return await Promise.race([
            call.then(
                () => 'returned',
                (err: unknown) => err,
            ),
            timeout,
        ]);
    } finally {
        clearTimeout(timer);
    }
}

// Canonical ABI `canon_lift` (`not ft.async_`): a call of a non-async-typed
// function that blocks with no ready thread of its instance traps where it
// blocks. Host work of another instance does not hold the trap back, since
// that instance may not run until the call returns.
suite('sync call blocking with no ready thread', () => {
    test.concurrent.each(['waitEmpty', 'suspendAfterExit'])(
        '%s traps while another instance waits on the host',
        async (fn) => {
            const { instance, cleanup } = await setup(`sync-call-block-trap-${fn}`);
            try {
                const started = (instance.start as () => Promise<void>)();
                started.catch(() => {});
                const call = (instance[fn] as () => Promise<void>)();
                const err = await outcome(call, 2000);
                assert.instanceOf(err, WebAssembly.RuntimeError);
                assert.match((err as Error).message, CANNOT_BLOCK);
            } finally {
                await cleanup();
            }
        },
    );
});
