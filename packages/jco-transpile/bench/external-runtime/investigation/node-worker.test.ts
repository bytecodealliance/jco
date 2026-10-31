import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'vitest';
import { nodeWorker } from './node-worker.mjs';

test.concurrent('worker success settles after process exit', async () => {
    const { child, done } = nodeWorker(['-e', 'process.stdout.write("42")']);
    const result = await done;
    assert.equal(result.stdout, '42');
    assert.equal(child.exitCode, 0);
});

test.concurrent('worker failure preserves the exit status and reaps the child', async () => {
    const { child, done } = nodeWorker(['-e', 'process.exit(2)']);
    await assert.rejects(done, (error: { code?: unknown }) => error.code === 2);
    assert.equal(child.exitCode, 2);
});

test.concurrent('aborting a worker leaves no live child', async () => {
    const controller = new AbortController();
    const { child, done } = nodeWorker(['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal });
    try {
        await once(child, 'spawn');
        controller.abort();
        await assert.rejects(done, { name: 'AbortError' });
        assert.throws(() => process.kill(child.pid!, 0), { code: 'ESRCH' });
    } finally {
        child.kill('SIGKILL');
        await done.catch(() => {});
    }
});

test.concurrent('worker timeout leaves no live child', async () => {
    const { child, done } = nodeWorker(['-e', 'setInterval(() => {}, 1000)'], { timeout: 100 });
    try {
        await assert.rejects(done);
        assert.throws(() => process.kill(child.pid!, 0), { code: 'ESRCH' });
    } finally {
        child.kill('SIGKILL');
        await done.catch(() => {});
    }
});
