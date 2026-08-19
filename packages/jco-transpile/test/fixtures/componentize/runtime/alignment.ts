// Flags: --instantiation

import { strict as assert } from 'node:assert';

import * as helpers from './helpers.js';
// @ts-expect-error generated fixture
import { instantiate } from '../js-test-components/alignment/alignment.js';

async function run() {
    const calls = new Map<string, number>();
    const markCalled = (name: string) => () => calls.set(name, (calls.get(name) ?? 0) + 1);
    const wasm = await instantiate(helpers.loadWasm, {
        imports: {
            u16: markCalled('u16'),
            u32: markCalled('u32'),
            u64: markCalled('u64'),
            flag32: markCalled('flag32'),
            record: markCalled('record'),
            float32: markCalled('float32'),
            float64: markCalled('float64'),
            string: markCalled('string'),
            list: markCalled('list'),
        },
    });

    const cases: [string, (ptr: number) => void][] = [
        ['u16', wasm.testU16],
        ['u32', wasm.testU32],
        ['u64', wasm.testU64],
        ['flag32', wasm.testFlag32],
        ['record', wasm.testRecord],
        ['float32', wasm.testFloat32],
        ['float64', wasm.testFloat64],
        ['string', wasm.testString],
        ['list', wasm.testList],
    ];

    for (const [name, test] of cases) {
        test(8);
        assert.equal(calls.get(name), 1, `${name} should accept an aligned list pointer`);

        assert.throws(() => test(1), /not aligned/);
        assert.equal(calls.get(name), 1, `${name} should trap before calling the host with an unaligned pointer`);
    }
}

await run();
