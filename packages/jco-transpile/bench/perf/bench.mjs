/**
 * Time calls through generated bindings of one variant built by `gen.mjs`.
 *
 * usage: node bench.mjs <variant-name> [case-filter]
 *
 * Prints raw nanoseconds per call and min/median/max for each case after warm-up.
 */
import assert from 'node:assert/strict';
import { summarize } from './statistics.mjs';
import { performance } from 'node:perf_hooks';

const variant = process.argv[2];
const filter = process.argv[3];
if (!variant) {
    throw new Error('usage: node bench.mjs <variant-name> [case-filter]');
}

/**
 * Import the bindings of one fixture of the variant.
 *
 * @param {string} name - fixture name
 * @returns {Promise<object>} the module namespace of the bindings
 */
const load = (name) => import(new URL(`../output/perf/${variant}/${name}/${name}.js`, import.meta.url).href);

const [numbers, strings, lists, records, roundTrip, closedStreams, readiness, transmit] = await Promise.all(
    [
        'numbers',
        'strings',
        'lists',
        'records',
        'async-round-trip-stackless',
        'async-closed-streams',
        'async-readiness',
        'async-synchronous-transmit',
    ].map(load),
);

const bytes = new Uint8Array(64).map((_, index) => index);
const byteList = Array.from(bytes);
const record = { a: 8, b: { a: true, b: false } };
const text = 'hello world, this is a string';

const chunk = new Uint8Array([2, 4, 6, 8, 9]);

/**
 * A host stream that yields one chunk of bytes and then ends.
 *
 * @returns {AsyncIterator<Uint8Array>} the stream, as the async iterator that bindings lower
 */
function byteStream() {
    let done = false;

    return {
        [Symbol.asyncIterator]() {
            return this;
        },
        async next() {
            if (done) {
                return { value: undefined, done: true };
            }
            done = true;
            return { value: chunk, done: true };
        },
    };
}

/**
 * Pass a stream to the guest and read the stream that it returns.
 *
 * @returns {Promise<unknown>} the chunk read from the returned stream
 */
async function streamThroughGuest() {
    const [output, expected] = await readiness.readiness.start(byteStream(), chunk);
    return output.read({ count: expected.length, dropAfterCopy: true });
}

/**
 * Pass a stream and a future to the guest and read the stream and future that it returns.
 *
 * @returns {Promise<unknown[]>} what the returned stream and future produced
 */
async function streamAndFutureThroughGuest() {
    const [outputStream, expected, outputFuture] = await transmit.synchronousTransmit.start(
        byteStream(),
        chunk,
        Promise.resolve(10),
        10,
    );
    return Promise.all([outputStream.read({ count: expected.length, dropAfterCopy: true }), outputFuture]);
}

/**
 * Benchmark cases: the function to time and how many calls make one round.
 * A function that returns a promise is awaited before the next call.
 */
const cases = {
    'export u32 -> u32': [() => numbers.test.roundtripU32(42), 100_000],
    'export f64 -> f64': [() => numbers.test.roundtripF64(1.5), 100_000],
    'export string -> string': [() => strings.roundtrip(text), 30_000],
    'export list<u8> -> list<u8>': [() => lists.test.listRoundtrip(bytes), 20_000],
    'export array -> list<u8>': [() => lists.test.listRoundtrip(byteList), 20_000],
    'export record -> record': [() => records.test.roundtripRecord1(record), 20_000],
    'export tuple swap': [() => records.test.swapTuple([1, 2]), 20_000],
    'guest calls 39 numeric imports': [() => numbers.testImports(), 1_000],
    'guest calls 2 string imports': [() => strings.testImports(), 10_000],
    'async export calling an async import': [() => roundTrip.baz.foo(text), 2_000],
    'async export reading a future<u8>': [
        () => closedStreams.closed.readFuture(Promise.resolve(7), 7, Promise.resolve(8)),
        2_000,
    ],
    'async export reading a stream<u8>': [() => closedStreams.closed.readStream(byteStream(), chunk), 2_000],
    'stream<u8> through the guest': [streamThroughGuest, 1_000],
    'stream<u8> and future<u8> through the guest': [streamAndFutureThroughGuest, 1_000],
};

const expected = {
    'export u32 -> u32': 42,
    'export f64 -> f64': 1.5,
    'export string -> string': text,
    'export list<u8> -> list<u8>': bytes,
    'export array -> list<u8>': bytes,
    'export record -> record': record,
    'export tuple swap': [2, 1],
    'guest calls 39 numeric imports': undefined,
    'guest calls 2 string imports': undefined,
    'async export calling an async import': `${text} - entered guest - entered host - exited host - exited guest`,
    'async export reading a future<u8>': undefined,
    'async export reading a stream<u8>': undefined,
    'stream<u8> through the guest': { value: new Uint8Array([1, 3, 5, 7, 11]), done: false },
    'stream<u8> and future<u8> through the guest': [{ value: new Uint8Array([1, 3, 5, 7, 11]), done: false }, 13],
};

const results = {};
for (const [name, [fn, iterations]] of Object.entries(cases)) {
    if (filter && !name.includes(filter)) {
        continue;
    }

    // Let the optimizing compiler settle before timing. Awaiting a value that is
    // not a promise would add a microtask to every synchronous call.
    const first = fn();
    const isAsync = first instanceof Promise;
    assert.deepStrictEqual(await first, expected[name], name);
    const round = isAsync
        ? async () => {
              for (let index = 0; index < iterations; index++) {
                  await fn();
              }
          }
        : () => {
              for (let index = 0; index < iterations; index++) {
                  fn();
              }
          };
    await round();

    const rounds = [];
    for (let sample = 0; sample < 5; sample++) {
        const start = performance.now();
        await round();
        rounds.push(((performance.now() - start) * 1e6) / iterations);
    }
    // Check the last state after repeated use as well as before warm-up.
    assert.deepStrictEqual(await fn(), expected[name], name);
    results[name] = { ...summarize(rounds), samples: rounds };
}
assert.ok(Object.keys(results).length, 'no benchmark case matches ' + filter);
console.log(JSON.stringify(results));
