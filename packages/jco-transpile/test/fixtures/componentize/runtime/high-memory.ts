// Flags: --instantiation

import * as assert from 'assert';

// @ts-expect-error
import { instantiate } from '../js-test-components/high-memory/high-memory.js';
import { loadWasm } from './helpers.js';

/** Values the host imports were called with, which were lifted out of the component's memory */
const received: unknown[] = [];

function echo<T>(v: T): T {
    received.push(v);
    return v;
}

// NOTE: a leading U+FEFF is part of the string, and must not be dropped as a BOM
const STRINGS = ['', 'a', 'hello, world', 'café', 'asdf中文🀄️⏰', '\ufeffbom', 'é'.repeat(70_000)];

const IMPORTS = {
    host: {
        echoString: echo,
        echoBytes: echo,
        echoStrings: echo,
        echoTuple: echo,
    },
};

/**
 * Check that a call throws
 *
 * A trap leaves the component instance unusable, so every call is made
 * against a newly instantiated component.
 */
async function assertThrows(call: (wasm: any) => unknown, expected: typeof TypeError) {
    const wasm = await instantiate(loadWasm, IMPORTS);
    assert.throws(() => call(wasm), expected);
}

async function run() {
    const wasm = await instantiate(loadWasm, IMPORTS);

    // Lowered into the component by the host, then lifted back out of it
    function direct<T>(fn: (v: T) => T, v: T) {
        assert.deepStrictEqual(fn(v), v);
    }

    // As above, with the component also passing the value through a host import
    function viaHost<T>(fn: (v: T) => T, v: T) {
        received.length = 0;
        assert.deepStrictEqual(fn(v), v);
        assert.deepStrictEqual(received, [v]);
    }

    for (const s of STRINGS) {
        direct(wasm.direct.echoString, s);
        direct(wasm.direct.echoStringUtf16, s);
        viaHost(wasm.viaHost.echoString, s);
        viaHost(wasm.viaHost.echoStringUtf16, s);
    }

    // Unpaired surrogates in a JS string are replaced when it is lowered
    for (const [s, lowered] of [
        ['\ud800', '\ufffd'],
        ['a\ud800b', 'a\ufffdb'],
        ['\udc00\ud800', '\ufffd\ufffd'],
        ['\ud800🚀\udc00', '\ufffd🚀\ufffd'],
    ]) {
        assert.strictEqual(wasm.direct.echoString(s), lowered);
        assert.strictEqual(wasm.direct.echoStringUtf16(s), lowered);
    }

    // Strings that are valid once the component has written to them are lifted as they are
    assert.strictEqual(wasm.direct.pokeString('ab', 0, 0x63), 'cb');
    assert.strictEqual(wasm.direct.pokeStringUtf16('ab', 0, 0x63), 'cb');
    assert.strictEqual(wasm.viaHost.pokeString('ab', 0, 0x63), 'cb');
    assert.strictEqual(wasm.viaHost.pokeStringUtf16('ab', 0, 0x63), 'cb');

    // Strings that are not valid must not be lifted, whether they are the result
    // of an export (`direct`) or an argument to an import (`viaHost`)
    for (const iface of ['direct', 'viaHost']) {
        // a continuation byte is missing
        await assertThrows((wasm) => wasm[iface].pokeString('é', 1, 0x41), TypeError);
        // a byte that never appears in UTF-8
        await assertThrows((wasm) => wasm[iface].pokeString('abc', 1, 0xff), TypeError);
        // a high surrogate that is not followed by a low surrogate
        await assertThrows((wasm) => wasm[iface].pokeStringUtf16('ab', 1, 0xd8), TypeError);
        // a low surrogate that does not follow a high surrogate
        await assertThrows((wasm) => wasm[iface].pokeStringUtf16('ab', 3, 0xdc), TypeError);
    }

    for (const bytes of [new Uint8Array([]), new Uint8Array([1, 2, 3, 255]), new Uint8Array(100_000).fill(7)]) {
        direct(wasm.direct.echoBytes, bytes);
        viaHost(wasm.viaHost.echoBytes, bytes);
    }

    direct(wasm.direct.echoU32s, new Uint32Array([]));
    direct(wasm.direct.echoU32s, new Uint32Array([1, 2, 0xffff_ffff, 0x8000_0000]));

    for (const strings of [[], [''], STRINGS]) {
        direct(wasm.direct.echoStrings, strings);
        viaHost(wasm.viaHost.echoStrings, strings);
    }

    for (const tuple of [
        [0, '', new Uint16Array([])],
        [0xffff_ffff, 'asdf中文🀄️⏰', new Uint16Array([1, 2, 0xffff])],
    ]) {
        direct(wasm.direct.echoTuple, tuple);
        viaHost(wasm.viaHost.echoTuple, tuple);
    }
}

await run();
