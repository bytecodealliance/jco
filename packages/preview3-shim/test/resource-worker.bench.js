import { describe, bench } from 'vitest';
import { ResourceWorker } from '../lib/nodejs/workers/resource-worker.js';

const _worker = new ResourceWorker(
    new URL('./noop-worker.js', import.meta.url)
);

describe('ResourceWorker round-trip', () => {
    bench(
        'async run noop',
        async () => {
            await _worker.run({ op: 'noop' });
        },
        { time: 1000 }
    );

    bench(
        'sync run noop',
        () => {
            _worker.runSync({ op: 'noop' });
        },
        { time: 1000 }
    );
});
