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

    // TODO: fix
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
                        asyncExports: ['pull-context', 'push-context'],
                        minify: false,
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

    test('context.get/set (async export, sync porcelain)', async () => {
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
                        asyncMode: "jspi",
                        asyncExports: ['push-context', 'pull-context'],
                    },
                },
            },
        });

        expect(instance.pushContext).toBeTruthy();
        assert.strictEqual(
            instance.pushContext instanceof AsyncFunction,
            true,
        );

        expect(instance.pullContext).toBeTruthy();
        assert.strictEqual(
            instance.pullContext instanceof AsyncFunction,
            true,
        );

        instance.pushContext(42);
        expect(await instance.pullContext()).toEqual(0);

        await cleanup();
    });
});
