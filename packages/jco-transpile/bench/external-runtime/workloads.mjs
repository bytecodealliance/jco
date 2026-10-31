import assert from 'node:assert/strict';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

export function importsFor(id) {
    const imports = ['numbers', 'variants', 'strings', 'lists', 'records', 'flavorful', 'futures'].includes(id)
        ? new WASIShim().getImportObject()
        : {};
    if (['numbers', 'variants', 'lists', 'records', 'flavorful'].includes(id)) {
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
    if (id === 'futures') {
        imports['jco:test-components/resources'] = {
            ExampleResource: class {
                getId() {
                    return 1;
                }
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
        case 'lists': {
            const input = new Uint8Array(260).subarray(2, 258);
            input.fill(17);
            assert.deepEqual(instance.test.listRoundtrip(input), input);
            const bytes = instance.allocatedBytes();
            const call = (i) => {
                input[255] = (i & 255) + 1;
                return instance.test.listRoundtrip(input)[255];
            };
            for (let i = 0; i < 10; i++) {
                assert.equal(call(i), ((i & 255) + 1) & 255);
            }
            assert.equal(instance.allocatedBytes(), bytes, 'list roundtrips must release guest allocations');
            return { call, async: false };
        }
        case 'records': {
            const input = { a: 42, b: { a: true, b: false } };
            assert.deepEqual(instance.test.roundtripRecord1(input), input);
            assert.deepEqual(instance.test.tuple1([17]), [17]);
            assert.deepEqual(instance.test.roundtripFlags2({ c: true }), { c: true, d: false, e: false });
            return {
                call: (i) => {
                    input.a = (i & 127) + 1;
                    return instance.test.roundtripRecord1(input).a;
                },
                async: false,
            };
        }
        case 'flavorful': {
            const input = { a: 'list_in_record3 input' };
            assert.deepEqual(instance.test.fListInRecord3(input), { a: 'list_in_record3 output' });
            assert.equal(instance.test.fListInVariant3('input3'), 'output3');
            assert.deepEqual(instance.test.listTypedefs('typedef1', ['typedef2']), [
                new TextEncoder().encode('typedef3'),
                ['typedef4'],
            ]);
            return { call: () => instance.test.fListInRecord3(input).a.length, async: false };
        }
        case 'resources': {
            const call = () => {
                const before = instance.drops();
                instance.run();
                const resource = instance.api.make();
                resource[Symbol.dispose]();
                return instance.drops() - before;
            };
            const before = instance.drops();
            assert.equal(call(), 2);
            assert.equal(instance.drops(), before + 2);
            return { call, async: false };
        }
        case 'events': {
            assert.equal(await instance.pollEmptySet(), 0);
            return { call: async () => instance.pollEmptySet(), async: true };
        }
        case 'async': {
            assert.equal(await instance.run(), 42);
            return { call: async () => instance.run(), async: true };
        }
        case 'futures': {
            const fn = instance['jco:test-components/future-lower-sync'].futurePassthrough;
            assert.equal(await fn(Promise.resolve(42)), 42);
            return { call: async (i) => fn(Promise.resolve(i & 255)), async: true };
        }
        case 'streams': {
            await assert.rejects(async () => instance.zeroLengthWrite(), {
                name: 'RuntimeError',
                message: 'cannot read from and write to intra-component future/stream with non-numeric payload',
            });
            // Canonical End.copy rejects this payload even for a zero-length copy.
            // The trap poisons the instance, so it cannot be reused for throughput.
            return { call: undefined, async: true };
        }
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
        case 'futures':
            return i & 255;
        case 'lists':
            return ((i & 255) + 1) & 255;
        case 'records':
            return (i & 127) + 1;
        case 'async':
            return 42;
        case 'flavorful':
            return 'list_in_record3 output'.length;
        case 'resources':
            return 2;
        case 'events':
            return 0;
        default:
            throw new Error(`No timed result for ${id}`);
    }
}
