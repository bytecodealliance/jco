import { join } from 'node:path';

import { suite, test } from 'vitest';

import { buildAndTranspile, COMPONENT_FIXTURES_DIR } from './common.js';

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/transmit.rs
//
suite('poll scenario', () => {
    class HostThing {
        #wakers;

        setReady(ready) {
            if (ready) {
                const wakers = this.#wakers;
                this.#wakers = undefined;
                for (const resolve of wakers ?? []) {
                    resolve();
                }
            } else {
                this.#wakers ??= [];
            }
        }

        async whenReady() {
            if (!this.#wakers) {
                return;
            }
            const { promise, resolve } = Promise.withResolvers();
            this.#wakers.push(resolve);
            await promise;
        }
    }

    test('stackless', async () => {
        let cleanup;
        const componentPath = join(COMPONENT_FIXTURES_DIR, 'p3/poll/async-poll-stackless.wasm');
        try {
            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        'local:local/ready': {
                            Thing: HostThing,
                        },
                    },
                },

                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            await instance['local:local/run'].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test('synchronous', async () => {
        let cleanup;
        const componentPath = join(COMPONENT_FIXTURES_DIR, 'p3/poll/async-poll-synchronous.wasm');
        try {
            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        'local:local/ready': {
                            Thing: HostThing,
                        },
                    },
                },

                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            await instance['local:local/run'].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
