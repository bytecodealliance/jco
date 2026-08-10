import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

const RUNNER_EXPORT = 'jco:test-components/reexport-runner';
const HANDOFF_EXPORT = 'jco:test-components/reexport-handoff';

suite('composed component re-exporting a fused resource type', () => {
    // When an async cross-component call returns an owned resource across the fused
    // boundary AND the same resource type is re-exported by one of the composition's
    // exported interfaces, the taskReturn trampoline's lift metadata used to
    // reference the resource class directly (`className: Widget`) above
    // the `class Widget { ... }` declaration.
    //
    // Trampoline binds were previously evaluated at the module top level rather than the
    // call site, the class was not available for creation. With the fix in,
    // the class is referred to at the time of creation (not at bind time).
    test('instantiates and returns the owned resource across the boundary', async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'resource-reexport-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'resource-reexport-g2g-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'resource-reexport-g2g',
                path: componentPath,
                imports: { ...new WASIShim().getImportObject() },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                        asyncExports: [`${RUNNER_EXPORT}#run-reexport`, `${HANDOFF_EXPORT}#poke-widget`],
                    },
                },
            },
        });
        try {
            assert.instanceOf(instance[RUNNER_EXPORT].runReexport, AsyncFunction);
            assert.isFunction(instance[HANDOFF_EXPORT].pokeWidget);
            // The call rides the once-TDZ'd lift metadata: the callee's
            // widget is lifted through the composition's taskReturn path.
            assert.strictEqual(await instance[RUNNER_EXPORT].runReexport(), 42);
        } finally {
            await cleanup();
        }
    });
});
