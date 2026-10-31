import assert from 'node:assert/strict';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

export function importsFor(id) {
    const imports = ['numbers', 'variants', 'strings'].includes(id) ? new WASIShim().getImportObject() : {};
    if (id === 'numbers' || id === 'variants') {
        imports[`test:${id}/test`] = new Proxy({}, { get: () => (value) => value });
    }
    if (id === 'strings') {
        imports['test:strings/imports'] = {
            takeBasic(value) {
                assert.equal(value, 'latin utf16');
            },
            returnUnicode() {
                return '🚀🚀🚀 𠈄𓀀';
            },
        };
    }
    return imports;
}

/** Independent known answers also validate every timed checksum. */
export async function workload(id, instance) {
    switch (id) {
        case 'noise':
            assert.equal(instance.scalar(17), 18);
            return { call: (i) => instance.scalar(i & 255), async: false };
        case 'empty':
            assert.deepEqual(Object.keys(instance), []);
            return { call: undefined, async: false };
        case 'adder':
            assert.equal(instance.add.add(17, 25), 42);
            return { call: (i) => instance.add.add(i & 255, 1), async: false };
        case 'numbers':
            assert.equal(instance.test.roundtripU64(2n ** 64n - 1n), 2n ** 64n - 1n);
            assert.equal(instance.test.roundtripS64(-(2n ** 63n)), -(2n ** 63n));
            assert.equal(instance.test.roundtripF32(1.25), 1.25);
            assert.equal(instance.test.roundtripF64(-Math.PI), -Math.PI);
            assert.equal(instance.test.roundtripChar('🚀'), '🚀');
            return { call: (i) => Number(instance.test.roundtripU64(BigInt(i & 255))), async: false };
        case 'strings':
            instance.testImports();
            // This historical C fixture asserts nonempty input. Empty-string ABI
            // behavior is covered by unit and generated-component conformance.
            for (const value of ['str', 'café 中文 🚀', '\ufeffbom']) {
                assert.equal(instance.roundtrip(value), value);
            }
            return {
                call: (i) => {
                    const result = instance.roundtrip('café 🚀 ' + (i & 255));
                    let hash = 0;
                    for (let j = 0; j < result.length; j++) {
                        hash = (Math.imul(hash, 31) + result.charCodeAt(j)) >>> 0;
                    }
                    return hash;
                },
                async: false,
            };
        case 'variants': {
            assert.equal(instance.test.roundtripOption(undefined), undefined);
            assert.equal(instance.test.roundtripOption(42), 42);
            const input = [
                { tag: 'a', val: 1 },
                { tag: 'a', val: 2 },
                { tag: 'a', val: 3 },
                { tag: 'a', val: 4n },
                { tag: 'a', val: 5n },
                { tag: 'a', val: 6 },
            ];
            assert.deepEqual(instance.test.variantCasts(input), input);
            return {
                call: (i) => {
                    const value = i & 255;
                    input[0].val = value;
                    input[3].val = BigInt(value);
                    input[5].val = value + 6;
                    const result = instance.test.variantCasts(input);
                    return Number(result[0].val) + Number(result[3].val) + Number(result[5].val);
                },
                async: false,
            };
        }
        case 'resource':
            assert.equal(instance.run(42), 42);
            assert.equal(instance.run(7), 7);
            return { call: (i) => instance.run((i & 255) + 1), async: false };
        default:
            throw new Error(`Missing workload for ${id}`);
    }
}

export function expectedResult(id, i) {
    switch (id) {
        case 'numbers':
            return i & 255;
        case 'strings': {
            let hash = 4119313438;
            for (const digit of String(i & 255)) {
                hash = (Math.imul(hash, 31) + digit.charCodeAt(0)) >>> 0;
            }
            return hash;
        }
        case 'variants':
            return (i & 255) * 3 + 6;
        case 'noise':
            return (i & 255) + 1;
        case 'adder':
            return (i & 255) + 1;
        case 'resource':
            return (i & 255) + 1;
        default:
            throw new Error(`No timed result for ${id}`);
    }
}
