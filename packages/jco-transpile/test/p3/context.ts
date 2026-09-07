import { join } from 'node:path';

import { fileURLToPath } from 'node:url';

import { suite, test, expect } from 'vitest';

import { setupAsyncTest } from '../helpers.js';

const COMPONENT_FIXTURES_DIR = fileURLToPath(new URL('../fixtures/components', import.meta.url));

const P3_COMPONENT_FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'p3');

suite('Context (WASI P3)', () => {
    test.concurrent('context.get/set (sync export, sync call)', async () => {
        const name = 'context-sync';

        // NOTE: Despite not specifying the export as async (via jco transpile options in setupAsyncTest),
        // the export is async -- since the component lifted the function in an async manner.
        //
        // This test performs a sync call of an async lifted export.
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(P3_COMPONENT_FIXTURES_DIR, name, 'component.wasm'),
            },
        });

        expect(instance.pullContext).toBeTruthy();
        expect(instance.pushContext).toBeTruthy();
        expect(instance.pushContext(33)).toEqual(33);
        // NOTE: context is wiped from task to task, and sync call tasks end as soon as they return
        expect(instance.pullContext()).toEqual(0);

        await cleanup();
    });

    test.concurrent.each([
        { minify: false, suspend: false },
        { minify: true, suspend: false },
        { minify: false, suspend: true },
        { minify: true, suspend: true },
    ])('fused adapters preserve context (minify=$minify, suspend=$suspend)', async ({ minify, suspend }) => {
        let pauses = 0;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: suspend ? 'jspi' : undefined,
            component: {
                name: 'context-fused',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'context-fused.wat'),
                imports: {
                    pause: {
                        default: () => {
                            pauses++;
                            return suspend ? new Promise<void>((resolve) => setTimeout(resolve, 0)) : undefined;
                        },
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify,
                        asyncImports: suspend ? ['pause'] : [],
                        asyncExports: suspend ? ['run'] : [],
                    },
                },
            },
        });
        try {
            // Guest assertions check context during initialization, realloc,
            // the composed call (including suspension), and post-return. A
            // second call proves context resets and cleanup cannot leak.
            for (let call = 1; call <= 2; call++) {
                const result = instance.run();
                expect(suspend ? await result : result).toBe(42);
                expect(instance.postCount()).toBe(call);
                expect(pauses).toBe(call);
            }
        } finally {
            await cleanup();
        }
    });
});
