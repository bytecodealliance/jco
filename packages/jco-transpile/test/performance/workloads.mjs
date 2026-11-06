import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

// Keep this group small: one P2 reference and compound P3 calls, futures and streams.
export const components = [
    { id: 'flavorful', fixture: 'components/runtime/flavorful.component.wasm', async: false },
    { id: 'p3-roundtrip', fixture: 'components/p3/round-trip/async-round-trip-many-stackless.wasm', async: true },
    { id: 'p3-future', fixture: 'generated/rust-test-components/future-lower.wasm', async: true },
    { id: 'p3-stream', fixture: 'generated/rust-test-components/stream-lower.wasm', async: true },
];

function stream(values) {
    return new ReadableStream({
        start(controller) {
            for (const value of values) {
                controller.enqueue(value);
            }
            controller.close();
        },
    });
}

class ExampleResource {
    #id;
    constructor(id) {
        this.#id = id;
    }
    getId() {
        return this.#id;
    }
}

function manyArguments(text) {
    const record = { a: new Int32Array(42).fill(42), b: true, c: 424242n };
    return [
        text,
        42,
        new Uint8Array(42).fill(42),
        [4242n, 424242424242n],
        record,
        record,
        { tag: 'err', val: undefined },
    ];
}

export function importsFor(id) {
    const imports = new WASIShim().getImportObject();
    if (id === 'flavorful') {
        imports['test:flavorful/test'] = new Proxy({}, { get: () => (value) => value });
    } else if (id === 'p3-roundtrip') {
        imports['local:local/many'] = {
            async foo(text, ...rest) {
                for (let i = 0; i < 5; i++) {
                    await Promise.resolve();
                }
                return [`${text} - entered host - exited host`, ...rest];
            },
        };
    } else {
        imports['jco:test-components/resources'] = { ExampleResource };
    }
    return imports;
}

export function workload(id, instance, utilities) {
    switch (id) {
        case 'flavorful':
            return () => [
                instance.test.fListInRecord3({ a: 'list_in_record3 input' }),
                instance.test.fListInVariant3('input3'),
                instance.test.listTypedefs('typedef1', ['typedef2']),
            ];
        case 'p3-roundtrip':
            return (seed) => instance.many.foo(...manyArguments(`café 🚀 ${seed}`));
        case 'p3-future': {
            const api = instance['jco:test-components/future-lower-async'];
            const { Future } = utilities;
            return async (seed) => [
                await api.readFutureValueRecord(
                    new Promise((resolve) => queueMicrotask(() => resolve({ id: seed, idStr: `future 中文 ${seed}` }))),
                ),
                await api.readFutureValueFutureString(new Future(new Future(String(seed)))),
            ];
        }
        case 'p3-stream': {
            const api = instance['jco:test-components/stream-lower-async'];
            return async (seed) => [
                await api.readStreamValuesU32(stream(Array.from({ length: 16 }, (_, i) => seed + i))),
                await api.readStreamValuesRecord(
                    stream([
                        { id: seed, idStr: `café 🚀 ${seed}` },
                        { id: seed + 1, idStr: '中文' },
                    ]),
                ),
                await api.readStreamValuesVariant(
                    stream([
                        { tag: 'maybe-u32', val: seed },
                        { tag: 'maybe-u32', val: null },
                        { tag: 'str', val: `variant ${seed}` },
                    ]),
                ),
                await api.readStreamValuesListU8(
                    stream([Uint8Array.from({ length: 16 }, (_, i) => (seed + i) & 255), new Uint8Array([0, 255])]),
                ),
                await api.readStreamValuesExampleResourceOwnAttr(
                    stream([new ExampleResource(seed), new ExampleResource(seed + 1), new ExampleResource(seed + 2)]),
                ),
                await api.readStreamValuesStreamString(
                    stream([stream([`nested ${seed}`, '☃']), stream(['second', '😀'])]),
                ),
                await api.readStreamValuesFutureString(
                    stream(
                        [`future ${seed}`, 'pending 中文', '🚀'].map(
                            (value) => new Promise((resolve) => queueMicrotask(() => resolve(value))),
                        ),
                    ),
                ),
                await api.readStreamValuesResultString(
                    stream([
                        { tag: 'ok', val: `ok ${seed}` },
                        { tag: 'err', val: 'expected error' },
                    ]),
                ),
            ];
        }
        default:
            throw new Error(`Unknown performance workload: ${id}`);
    }
}

// Independent known answers; never derive these from either runtime's output.
export function expected(id, seed) {
    switch (id) {
        case 'flavorful':
            return [{ a: 'list_in_record3 output' }, 'output3', [new TextEncoder().encode('typedef3'), ['typedef4']]];
        case 'p3-roundtrip':
            return manyArguments(`café 🚀 ${seed} - entered guest - entered host - exited host - exited guest`);
        case 'p3-future':
            return [{ id: seed, idStr: `future 中文 ${seed}` }, String(seed)];
        case 'p3-stream':
            return [
                Uint32Array.from({ length: 16 }, (_, i) => seed + i),
                [
                    { id: seed, idStr: `café 🚀 ${seed}` },
                    { id: seed + 1, idStr: '中文' },
                ],
                [
                    { tag: 'maybe-u32', val: seed },
                    { tag: 'maybe-u32', val: undefined },
                    { tag: 'str', val: `variant ${seed}` },
                ],
                [Uint8Array.from({ length: 16 }, (_, i) => (seed + i) & 255), new Uint8Array([0, 255])],
                Uint32Array.from([seed, seed + 1, seed + 2]),
                [
                    [`nested ${seed}`, '☃'],
                    ['second', '😀'],
                ],
                [`future ${seed}`, 'pending 中文', '🚀'],
                [
                    { tag: 'ok', val: `ok ${seed}` },
                    { tag: 'err', val: 'expected error' },
                ],
            ];
        default:
            throw new Error(`Unknown performance workload: ${id}`);
    }
}
