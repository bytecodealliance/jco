import { join } from 'node:path';

import { assert, beforeAll, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

suite('streams of a host resource shared by component instances', () => {
    let componentPath: string;

    beforeAll(async () => {
        componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-host-resource-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-host-resource-callee.wasm'),
        });
    });

    // Regression for #2400: both instances import the same resource type, but
    // each writer must lift its stream elements from its own handle table.
    test.concurrent.each(['caller', 'callee'])('reads resources written by the %s instance', async (writer) => {
        class Thing {}
        const made: Thing[] = [];
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: `stream-host-resource-${writer}`,
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/stream-host-resource-source': {
                        Thing,
                        make() {
                            const thing = new Thing();
                            made.push(thing);
                            return thing;
                        },
                    },
                },
            },
        });
        try {
            for (let i = 0; i < 3; i++) {
                const stream = await instance.run(writer === 'callee');
                const { value, done } = await stream.next();
                assert.isFalse(done);
                assert.strictEqual(made.length, i + 1);
                assert.strictEqual(value, made[i]);
                assert.isTrue((await stream.next()).done);
            }
        } finally {
            await cleanup();
        }
    });
});
