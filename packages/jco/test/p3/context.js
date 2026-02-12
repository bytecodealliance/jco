import { join } from 'node:path';

import { fileURLToPath } from 'node:url';

import { suite, test, assert, expect } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction } from '../common.js';

const COMPONENT_FIXTURES_DIR = fileURLToPath(
    new URL('../fixtures/components', import.meta.url)
);

const P3_COMPONENT_FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'p3');

suite('Context (WASI P3)', () => {
    test('context.get/set (sync export, sync call)', async () => {
        const name = 'context-sync';

        // NOTE: Despite not specifying the export as async (via jco transpile options in setupAsyncTest),
        // the export is async -- since the component lifted the function in an async manner.
        //
        // This test performs a sync call of an async lifted export.
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(
                    P3_COMPONENT_FIXTURES_DIR,
                    name,
                    'component.wasm'
                ),
            },
        });

        expect(instance.pullContext).toBeTruthy();
        expect(instance.pushContext).toBeTruthy();
        expect(instance.pushContext(33)).toEqual(33);
        // NOTE: context is wiped from task to task, and sync call tasks end as soon as they return
        expect(instance.pullContext()).toEqual(0);

        await cleanup();
    });

    test('context.get/set (async export, async porcelain)', async () => {
        const name = 'context-async';
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name,
                path: join(
                    P3_COMPONENT_FIXTURES_DIR,
                    name,
                    'component.wasm'
                ),
            },
            jco: {
                transpile: {
                    extraArgs: {
                        // minify: false,
                        asyncExports: ['pull-context', 'push-context'],
                    },
                },
            },
        });

        expect(instance.pushContext).toBeTruthy();
        assert.strictEqual(instance.pushContext instanceof AsyncFunction, true);

        expect(instance.pullContext).toBeTruthy();
        assert.strictEqual(instance.pullContext instanceof AsyncFunction, true);

        await instance.pushContext(42);
        // NOTE: context is wiped from task to task
        expect(await instance.pullContext()).toEqual(0);

        await cleanup();
    });

    // This test ensures that a useful error is produced when a user
    // executes an async export that is *not* an interface (i.e. provided by the host)
    // but forgets to wait for the result.
    //
    // At present, two async exports cannot run at the same time -- i.e. the first
    // call must resolve/be awaited before the second one is run.
    //
    // This may change in the future/be accounted w/ re-entrancy checks,
    // but until that time, doing so is likely a bug that should be
    // explained clearly to the user.
    //
    // TODO(fix): we need a nother way to detect this case, as
    // imports that are called deep in guest->guest call chains
    // will trip this check if we do as simple other-tasks-exist check
    test.skip('forgotten await on existing export call', async () => {
        const name = 'context-async';
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(
                    P3_COMPONENT_FIXTURES_DIR,
                    name,
                    'component.wasm'
                ),
            },
            jco: {
                transpile: {
                    extraArgs: {
                        // minify: false,
                        asyncMode: "jspi",
                        asyncExports: ['push-context', 'pull-context'],
                    },
                },
            },
        });

        try {
            instance.pushContext(42); // await should have been here
            await instance.pullContext();
            assert.fail("should have thrown");
        } catch(err) {
            expect(err.message).toContain("task is already running");
        }

        await cleanup();
    });

});
