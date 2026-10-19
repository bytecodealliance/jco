import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { assert, suite, test } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite('component model maps', () => {
    test('round-trips maps across guest and host', async () => {
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
                        roundtripSiblings(first, second) {
                            assert.instanceOf(first, Map);
                            assert.instanceOf(second, Map);
                            return [
                                new Map([...first, ['first-host', 101]]),
                                new Map([...second, ['second-host', 202]]),
                            ];
                        },
                        roundtripNested(values) {
                            assert.instanceOf(values, Map);
                            return new Map(
                                [...values].map(([key, inner]) => {
                                    assert.instanceOf(inner, Map);
                                    return [key, new Map([...inner, [100, 'from-host']])];
                                }),
                            );
                        },
                        roundtripList(values) {
                            return values.map((value) => {
                                assert.instanceOf(value, Map);
                                return new Map([...value, ['from-list-host', 42]]);
                            });
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

        const second = new Map([
            ['three', 3],
            ['four', 4],
            ['five', 5],
        ]);

        for (const first of [strings, new Map()]) {
            assert.deepEqual(api.hostRoundtripSiblings(first, second), [
                new Map([...first, ['first-host', 101]]),
                new Map([...second, ['second-host', 202]]),
            ]);
        }

        const nested = new Map([
            [
                'first',
                new Map([
                    [1, 'one'],
                    [2, 'two'],
                ]),
            ],
            ['second', new Map([[3, 'three']])],
            ['empty', new Map()],
        ]);
        assert.deepEqual(
            api.hostRoundtripNested(nested),
            new Map([...nested].map(([key, inner]) => [key, new Map([...inner, [100, 'from-host']])])),
        );
        assert.deepEqual(api.hostRoundtripNested(new Map()), new Map());

        const listed = [strings, new Map(), new Map([['last', 3]])];
        assert.deepEqual(
            api.hostRoundtripList(listed),
            listed.map((value) => new Map([...value, ['from-list-host', 42]])),
        );
        assert.deepEqual(api.hostRoundtripList([]), []);

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
