import { join } from 'node:path';

import { assert, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const fixture = join(P3_COMPONENT_FIXTURES_DIR, 'cancellation/future-copy-identity.wat');
const BLOCKED = 0xffff_ffff;
const CANCELLED = 2;

// A future has one source value even when its reader starts several attempts.
for (const cancelledReads of [1, 3]) {
    test.concurrent(`a host future is injected once after ${cancelledReads} cancelled reads`, async ({ expect }) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { name: `future-copy-identity-${cancelledReads}`, path: fixture },
        });
        let finish: (value: number) => void;
        const source = new Promise<number>((resolve) => {
            finish = resolve;
        });
        try {
            assert.equal(instance.start(source), CANCELLED);
            for (let attempt = 1; attempt < cancelledReads; attempt++) {
                assert.equal(instance.read(), BLOCKED);
                assert.equal(instance.cancel(), CANCELLED);
            }
            assert.equal(instance.read(), BLOCKED);
            finish(42);
            await expect.poll(() => instance.poll(), { timeout: 5000 }).not.toBe(0);
            assert.equal(instance.payload(), 0); // COMPLETED
            assert.equal(instance.value(), 42);
            await new Promise((resolve) => setTimeout(resolve, 0));
            assert.equal(instance.poll(), 0, 'the single write must not publish another event');
        } finally {
            finish(42);
            await cleanup();
        }
    });
}

test.concurrent('dropping a cancelled future still disposes its pending host source once', async ({ expect }) => {
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: { name: 'future-copy-identity-dispose', path: fixture },
    });
    let finish: (value: number) => void;
    const source = new Promise<number>((resolve) => {
        finish = resolve;
    });
    let disposals = 0;
    Object.defineProperty(source, Symbol.dispose, {
        value: () => {
            disposals++;
        },
    });
    try {
        assert.equal(instance.start(source), CANCELLED);
        instance.drop();
        await expect.poll(() => disposals, { timeout: 5000 }).toBe(1);
        finish(42);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(instance.poll(), 0);
        assert.equal(disposals, 1);
    } finally {
        finish(42);
        await cleanup();
    }
});
