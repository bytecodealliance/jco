import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { expect, test } from 'vitest';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

test.concurrent('a second async cancellation cannot restart a pending stream cancellation', async () => {
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: {
            name: 'repeated-stream-cancel',
            path: join(P3_COMPONENT_FIXTURES_DIR, 'cancellation/repeated-cancel.wat'),
        },
    });
    try {
        const source = new ReadableStream<Uint32Array>();
        const result = Promise.resolve().then(() => instance.run(source));
        await expect(result).rejects.toBeInstanceOf(WebAssembly.RuntimeError);
        await expect(result).rejects.toThrow('cannot cancel stream while cancellation is already in progress');
    } finally {
        await cleanup();
    }
});
