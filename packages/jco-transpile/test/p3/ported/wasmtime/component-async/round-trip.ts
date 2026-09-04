import assert from 'node:assert';
import { join } from 'node:path';

import { suite, test } from 'vitest';

import { buildAndTranspile, COMPONENT_FIXTURES_DIR } from './common.js';

// These tests are ported from upstream wasmtime's component-async-tests:
//
// - wasmtime/crates/misc/component-async-tests/tests/scenario/round_trip.rs
// - wasmtime/crates/misc/component-async-tests/tests/scenario/round_trip_direct.rs
// - wasmtime/crates/misc/component-async-tests/tests/scenario/round_trip_many.rs

const inputs = ['hello, world!', '¡hola, mundo!', "hi y'all!"];

async function yieldTimes(count) {
    for (let i = 0; i < count; i++) {
        await Promise.resolve();
    }
}

async function roundTripHost(input) {
    await yieldTimes(5);
    return `${input} - entered host - exited host`;
}

function expectedOutput(input) {
    return `${input} - entered guest - entered host - exited host - exited guest`;
}

async function testRoundTrip(componentName) {
    let cleanup;
    try {
        const res = await buildAndTranspile({
            componentPath: join(COMPONENT_FIXTURES_DIR, 'p3/round-trip', componentName),
            instantiation: {
                imports: {
                    'local:local/baz': { foo: roundTripHost },
                },
            },
        });
        cleanup = res.cleanup;

        const outputs = await Promise.all(inputs.map((input) => res.instance.baz.foo(input)));
        assert.deepStrictEqual(outputs, inputs.map(expectedOutput));
    } finally {
        if (cleanup) {
            await cleanup();
        }
    }
}

function manyArguments(input) {
    const stuff = {
        a: new Int32Array(42).fill(42),
        b: true,
        c: 424242n,
    };

    return [
        input,
        42,
        new Uint8Array(42).fill(42),
        [4242n, 424242424242n],
        stuff,
        stuff,
        { tag: 'err', val: undefined },
    ];
}

async function roundTripManyHost(a, b, c, d, e, f, g) {
    await yieldTimes(5);
    return [`${a} - entered host - exited host`, b, c, d, e, f, g];
}

async function testRoundTripMany(componentName) {
    let cleanup;
    try {
        const res = await buildAndTranspile({
            componentPath: join(COMPONENT_FIXTURES_DIR, 'p3/round-trip', componentName),
            instantiation: {
                imports: {
                    'local:local/many': { foo: roundTripManyHost },
                },
            },
        });
        cleanup = res.cleanup;

        const outputs = await Promise.all(inputs.map((input) => res.instance.many.foo(...manyArguments(input))));
        assert.deepStrictEqual(
            outputs,
            inputs.map((input) => manyArguments(expectedOutput(input))),
        );
    } finally {
        if (cleanup) {
            await cleanup();
        }
    }
}

suite('round-trip scenario', () => {
    test('direct stackless', async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(COMPONENT_FIXTURES_DIR, 'p3/round-trip/async-round-trip-direct-stackless.wasm'),
                instantiation: {
                    imports: {
                        foo: { default: roundTripHost },
                    },
                },
            });
            cleanup = res.cleanup;

            const outputs = await Promise.all(inputs.map((input) => res.instance.foo(input)));
            assert.deepStrictEqual(outputs, inputs.map(expectedOutput));
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test('many stackless', () => testRoundTripMany('async-round-trip-many-stackless.wasm'));

    test('many synchronous', () => testRoundTripMany('async-round-trip-many-synchronous.wasm'));

    test('many wait', () => testRoundTripMany('async-round-trip-many-wait.wasm'));

    test('wait', () => testRoundTrip('async-round-trip-wait.wasm'));

    test('stackless sync import', () => testRoundTrip('async-round-trip-stackless-sync-import.wasm'));

    test('indirect stackless', () => testRoundTrip('async-round-trip-stackless.wasm'));

    test('synchronous', () => testRoundTrip('async-round-trip-synchronous.wasm'));
});
