import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

/**
 * Instantiate `sync-call-beside-host-wait.wat` with controllable host imports.
 *
 * @param name - a name for the transpiled output
 * @returns the instance, its cleanup, the host's log and the import controls
 */
async function setup(name: string) {
    const log: number[] = [];
    let settlePending!: () => void;
    const pending = new Promise<void>((resolve) => {
        settlePending = resolve;
    });
    let onTick: () => Promise<void> = async () => {};
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: {
            name,
            path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-call-beside-host-wait.wat'),
            imports: {
                pending: { default: () => pending },
                tick: { default: () => onTick() },
                log: { default: (step: number) => void log.push(step) },
            },
        },
    });
    return {
        instance,
        cleanup,
        log,
        settlePending,
        setOnTick(fn: () => Promise<void>) {
            onTick = fn;
        },
    };
}

suite('sync call isolation', () => {
    test.concurrent('another instance’s stack resumes from a host call only after a sync call', async () => {
        const { instance, cleanup, log, settlePending, setOnTick } = await setup('sync-call-beside-host-wait-resume');
        try {
            const started = instance.start();
            // The host settles `start`'s call while `wait-host` is in progress.
            setOnTick(async () => {
                settlePending();
                await new Promise((resolve) => setTimeout(resolve, 20));
            });
            await instance.waitHost();
            await started;
            assert.deepEqual(log, [2, 1]);
        } finally {
            await cleanup();
        }
    });
});
