import { join } from 'node:path';

import { assert, beforeAll, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

const SOURCE_INTERFACE = 'jco:test-components/host-resource-source';
const RUNNER_INTERFACE = 'jco:test-components/host-resource-runner';

suite('guest->guest call into a callee holding host resources', () => {
    // Each component instance has its own handle table for an imported host
    // resource, so an async host import's owned result must be lowered into
    // the call site's own table for later handle lookups and drops to resolve.
    let componentPath: string;

    beforeAll(async () => {
        componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'host-resource-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'host-resource-g2g-callee.wasm'),
        });
    });

    for (const asyncMode of ['sync', 'jspi']) {
        for (const syncCount of [0, 1, 3]) {
            test.concurrent(`${asyncMode}: async import result after ${syncCount} sync handle(s)`, async () => {
                const disposed: string[] = [];
                class Thing {
                    #name: string;
                    constructor(name: string) {
                        this.#name = name;
                    }
                    name() {
                        return this.#name;
                    }
                    [Symbol.dispose]() {
                        disposed.push(this.#name);
                    }
                }

                const { instance, cleanup } = await setupAsyncTest({
                    asyncMode,
                    component: {
                        name: 'host-resource-g2g',
                        path: componentPath,
                        imports: {
                            ...new WASIShim().getImportObject(),
                            [SOURCE_INTERFACE]: {
                                Thing,
                                makeSync: (name: string) => new Thing(name),
                                makeAsync: async (name: string) => new Thing(name),
                            },
                        },
                    },
                });
                try {
                    const run = instance[RUNNER_INTERFACE].run;
                    assert.instanceOf(run, AsyncFunction);

                    const expected = [...Array.from({ length: syncCount }, (_, i) => `sync-${i}`), 'async'];
                    const names = await Promise.race([
                        run(syncCount),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('export call timed out')), 5_000)),
                    ]);
                    assert.deepEqual(names, expected);
                    assert.sameMembers(disposed, expected);
                } finally {
                    await cleanup();
                }
            });
        }
    }
});
