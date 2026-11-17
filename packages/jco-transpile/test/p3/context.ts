import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';

import { fileURLToPath } from 'node:url';

import { suite, test, expect } from 'vitest';

import { setupAsyncTest } from '../helpers.js';

const COMPONENT_FIXTURES_DIR = fileURLToPath(new URL('../fixtures/components', import.meta.url));

const P3_COMPONENT_FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'p3');

suite('Context (WASI P3)', () => {
    test.concurrent.each([
        { minify: false, suspend: false },
        { minify: true, suspend: false },
        { minify: false, suspend: true },
        { minify: true, suspend: true },
    ])('realloc isolates both context slots (minify=$minify, suspend=$suspend)', async ({ minify, suspend }) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: suspend ? 'jspi' : undefined,
            component: {
                name: 'context-realloc',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'context-realloc.wat'),
                imports: {
                    echo: { default: (value: string) => (suspend ? Promise.resolve(value) : value) },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify,
                        asyncImports: suspend ? ['echo'] : [],
                        asyncExports: suspend ? ['run'] : [],
                    },
                },
            },
        });
        try {
            for (let call = 0; call < 2; call++) {
                expect(await instance.run('hello')).toBe(5);
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each([false, true])(
        'realloc isolates both context slots when lowering an async import result (minify=%s)',
        async (minify: boolean) => {
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: 'context-realloc-async',
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'context-realloc-async.wat'),
                    imports: {
                        echo: {
                            default: (value: string) =>
                                new Promise<string>((resolve) => setTimeout(() => resolve(value), 0)),
                        },
                    },
                },
                jco: { transpile: { extraArgs: { minify } } },
            });
            try {
                for (let call = 0; call < 2; call++) {
                    expect(await instance.run('hello')).toBe(5);
                }
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent.each([false, true])(
        'realloc isolates both context slots when lowering a stream element (minify=%s)',
        async (minify: boolean) => {
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: 'context-realloc-stream-read',
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'context-realloc-stream-read.wat'),
                },
                jco: { transpile: { extraArgs: { minify } } },
            });
            try {
                for (let call = 0; call < 2; call++) {
                    const values = new ReadableStream<string>({
                        start(controller) {
                            setTimeout(() => {
                                controller.enqueue('hello');
                                controller.close();
                            }, 0);
                        },
                    });
                    expect(await instance.run(values)).toBe(5);
                }
            } finally {
                await cleanup();
            }
        },
        // A trap while lowering surfaces as an unhandled error rather than a rejected call.
        10_000,
    );

    test.concurrent.each([false, true])(
        'realloc isolates both context slots when lowering a future value (minify=%s)',
        async (minify: boolean) => {
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: 'context-realloc-future-read',
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'context-realloc-future-read.wat'),
                },
                jco: { transpile: { extraArgs: { minify } } },
            });
            try {
                for (let call = 0; call < 2; call++) {
                    const value = new Promise<string>((resolve) => setTimeout(() => resolve('hello'), 0));
                    expect(await instance.run(value)).toBe(5);
                }
            } finally {
                await cleanup();
            }
        },
        // A trap while lowering surfaces as an unhandled error rather than a rejected call.
        10_000,
    );

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

    test.concurrent.each([false, true])(
        'resource destructors isolate the caller context (minify=%s)',
        async (minify: boolean) => {
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: 'context-resource-drop',
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'context-resource-drop.wat'),
                },
                jco: { transpile: { extraArgs: { minify } } },
            });
            try {
                for (let round = 1; round <= 3; round++) {
                    // The guest asserts that a nested destructor starts with an empty context
                    // and leaves its caller's context value intact.
                    instance.run();
                    expect(instance.drops()).toBe(round * 2 - 1);
                    const resource: Disposable = instance.api.make();
                    resource[Symbol.dispose]();
                    resource[Symbol.dispose]();
                    expect(instance.drops()).toBe(round * 2);
                }
            } finally {
                await cleanup();
            }
        },
    );

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
