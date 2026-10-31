import assert from 'node:assert/strict';

export function importsFor() {
    return {};
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
