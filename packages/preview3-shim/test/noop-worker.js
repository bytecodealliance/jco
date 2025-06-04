import { Router } from '../lib/nodejs/workers/resource-worker.js';

Router().op('noop', () => {
    return { ok: true };
});
