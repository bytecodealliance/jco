import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { nodeWorker } from './node-worker.mjs';

test.concurrent.each([
    { args: ['--record'], error: /Unknown argument: --record/ },
    { args: ['adder'], error: /Unknown argument: adder/ },
    { args: ['--source', 'unused', '--anchor', 'unused', '--processes', '3'], error: /five or ten/ },
])('rejects an incomplete or recording protocol: $args', async ({ args, error }) => {
    const script = fileURLToPath(new URL('./frozen-replay.mjs', import.meta.url));
    const task = nodeWorker([script, ...args]);
    await assert.rejects(task.done, error);
    assert.equal(task.child.exitCode, 1);
});
