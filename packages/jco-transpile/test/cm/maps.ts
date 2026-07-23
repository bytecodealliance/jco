import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { assert, suite, test } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite('component model maps', () => {
    test('lifts and lowers maps across guest exports and host imports', async () => {
        const hostCalls = [];
        const { cleanup, instance, esModuleOutputDir } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'cm-maps.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/cm-maps-host': {
                        roundtrip(values) {
                            assert.instanceOf(values, Map);
                            hostCalls.push(values);
                            return new Map([...values, ['from-host', 42]]);
                        },
                    },
                },
            },
        });

        const api = instance['jco:test-components/cm-maps-api'];

        const strings = new Map([
            ['zero', 0],
            ['answer', 42],
        ]);
        const echoed = api.echoStrings(strings);
        assert.instanceOf(echoed, Map);
        assert.deepEqual(Object.fromEntries(echoed), Object.fromEntries(strings));
        assert.deepEqual([...api.echoStrings(new Map())], []);

        const bigintKeys = api.bigintKeys();
        assert.instanceOf(bigintKeys, Map);
        assert.strictEqual(bigintKeys.get(0n), 'zero');
        assert.strictEqual(bigintKeys.get(0xffff_ffff_ffff_ffffn), 'max');

        const structured = new Map([
            [false, { count: 0, label: 'off' }],
            [true, { count: 1, label: 'on' }],
        ]);
        const structuredResult = api.structuredValues(structured);
        assert.instanceOf(structuredResult, Map);
        assert.deepEqual(structuredResult.get(false), structured.get(false));
        assert.deepEqual(structuredResult.get(true), structured.get(true));

        const hostResult = api.hostRoundtrip(strings);
        assert.lengthOf(hostCalls, 1);
        assert.deepEqual(Object.fromEntries(hostCalls[0]), Object.fromEntries(strings));
        assert.deepEqual(Object.fromEntries(hostResult), {
            ...Object.fromEntries(strings),
            'from-host': 42,
        });

        assert.throws(() => api.echoStrings({ answer: 42 }), TypeError);

        const declarations = await readFile(
            join(esModuleOutputDir, 'interfaces/jco-test-components-cm-maps-api.d.ts'),
            'utf8',
        );
        assert.include(declarations, 'Map<string, number>');
        assert.include(declarations, 'Map<bigint, string>');
        assert.include(declarations, 'Map<boolean, MapValue>');

        await cleanup();
    });
});
