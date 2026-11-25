import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

/**
 * Settle with `value`, or with `'timed out'` if that takes longer than `ms`.
 *
 * @param value - the promise to wait for
 * @param ms - how long to wait
 * @returns the outcome
 */
function within<T>(value: Promise<T>, ms: number): Promise<T | 'timed out'> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timed out'>((resolve) => {
        timer = setTimeout(() => resolve('timed out'), ms);
    });
    return Promise.race([value, timeout]).finally(() => clearTimeout(timer));
}

suite('blocked initial invocation', () => {
    // The WAST fixture `stackful-entry-behind-blocked-invocation.wast` covers an initial
    // invocation blocked in a call to another component.
    test.concurrent('a stackful call enters while an initial invocation waits on an async host import', async () => {
        let release!: () => void;
        const waiting = new Promise<void>((resolve) => {
            release = resolve;
        });
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stackful-entry-behind-host-wait',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'stackful-entry-behind-host-wait.wat'),
                imports: {
                    wait: { default: () => waiting },
                    release: { default: () => release() },
                },
            },
        });
        try {
            const held = instance.hold();
            assert.strictEqual(await within(instance.unblock(), 2_000), undefined);
            assert.strictEqual(await within(held, 2_000), undefined);
        } finally {
            await cleanup();
        }
    });
});
