import { join } from 'node:path';

import { fileURLToPath } from 'url';

import { suite, test, expect } from 'vitest';

import { setupAsyncTest } from '../helpers.js';

const COMPONENT_FIXTURES_DIR = fileURLToPath(
    new URL('../fixtures/components', import.meta.url)
);

const P3_COMPONENT_FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'p3');

suite('Backpressure (WASI P3)', () => {
    test('backpressure.get (sync export, sync call)', async () => {
        const componentName = 'backpressure-sync';
        const componentPath = join(
            P3_COMPONENT_FIXTURES_DIR,
            componentName,
            'component.wasm'
        );

        // NOTE: Despite not specifying the export as async (via jco transpile options in setupAsyncTest),
        // the export is async -- since the component lifted the function in an async manner.
        //
        // This test performs a sync call of an async lifted export.
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: componentName,
                path: componentPath,
            },
        });

        expect(instance.setBackpressure).toBeTruthy();
        expect(instance.setBackpressure(1)).toEqual(1);
        expect(instance.setBackpressure(42)).toEqual(42);
        expect(instance.setBackpressure(0)).toEqual(0);

        await cleanup();
    });
});
