import { version } from 'node:process';
import { join } from 'node:path';

import { fileURLToPath } from 'url';

import { suite, test, assert, expect } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction } from '../common.js';

const COMPONENT_FIXTURES_DIR = fileURLToPath(
    new URL('../fixtures/components', import.meta.url)
);

const P3_COMPONENT_FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'p3');

suite('Guest Async (WASI P3)', () => {
    test('Transpile simple error-context', async (t) => {
        const componentPath = join(
            COMPONENT_FIXTURES_DIR,
            'async-error-context.component.wasm'
        );

        const { esModule, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async-error-context',
                path: componentPath,
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncExports: ['local:local/run#run'],
                    },
                },
            },
        });

        const { WASIShim } = await import(
            '@bytecodealliance/preview2-shim/instantiation'
        );
        const instance = await esModule.instantiate(
            undefined,
            new WASIShim().getImportObject()
        );

        const runFn = instance['local:local/run'].asyncRun;
        assert.strictEqual(
            runFn instanceof AsyncFunction,
            true,
            'local:local/run should be async'
        );

        await runFn();

        await cleanup();
    });

    test('context.get/set (sync export, sync call)', async () => {
        const componentName = 'context-sync';
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

        expect(instance.pullContext).toBeTruthy();
        expect(instance.pushContext).toBeTruthy();
        expect(instance.pushContext(33)).toEqual(33);
        expect(instance.pullContext()).toEqual(33);

        await cleanup();
    });

    test('context.get/set (async export, async call)', async (t) => {
        // Skip if we're running in an environment without JSPI
        let nodeMajorVersion = parseInt(version.replace('v', '').split('.')[0]);
        if (nodeMajorVersion < 23) {
            t.skip();
        }

        const componentName = 'context-async';
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
            asyncMode: 'jspi',
            component: {
                name: componentName,
                path: componentPath,
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

        // TODO(async): async invoke test, yield must resolve in pullContext execution

        await cleanup();
    });

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
