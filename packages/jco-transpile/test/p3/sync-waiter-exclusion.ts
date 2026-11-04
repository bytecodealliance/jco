import { join } from 'node:path';
import { expect, test } from 'vitest';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const operations = ['future.read', 'future.write', 'stream.read', 'stream.write'];
const cases = operations.flatMap((operation, kind) => [
    { operation, kind, action: 0, attempted: 'waitable removal', error: 'waitable cannot be used synchronously' },
    { operation, kind, action: 1, attempted: 'async cancellation', error: 'waitable already has a synchronous waiter' },
]);

test.concurrent.each(cases)('$attempted cannot interrupt synchronous $operation', async ({ kind, action, error }) => {
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: {
            name: `sync-waiter-${kind}-${action}`,
            path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-waiter/exclusion.wat'),
        },
    });
    try {
        const result = instance.run(kind, action);
        await expect(result).rejects.toBeInstanceOf(WebAssembly.RuntimeError);
        await expect(result).rejects.toThrow(error);
    } finally {
        await cleanup();
    }
});
