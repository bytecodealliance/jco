// Flags: --instantiation

import * as assert from 'assert';

// @ts-expect-error
import { instantiate } from '../js-test-components/string-transcoding/string-transcoding.js';
import { loadWasm } from './helpers.js';

const UTF16_TAG = 0x8000_0000;

/** What a latin1+utf16 component should receive for a given string */
function compact(s: string): { taggedLen: number; raw: Uint8Array } {
    const units = Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
    if (units.every((unit) => unit <= 0xff)) {
        return { taggedLen: units.length, raw: new Uint8Array(units) };
    }
    const raw = new Uint8Array(units.length * 2);
    const view = new DataView(raw.buffer);
    units.forEach((unit, i) => view.setUint16(i * 2, unit, true));
    return { taggedLen: (units.length | UTF16_TAG) >>> 0, raw };
}

const STRINGS = [
    '',
    'a',
    'hello, world',
    // latin1, but multi-byte in UTF-8
    'é',
    'café',
    'ÿ is the last latin1 char',
    '\u0080ÿ\u0000\u007f',
    // not latin1
    'Ā',
    'Ā is the first non-latin1 char',
    'latin1 prefix, then Ā',
    'café 中文 café',
    '中文',
    // surrogate pairs
    '🚀',
    'asdf中文🀄️⏰',
    'é🚀é',
    // the non-latin1 remainder starts with U+FEFF, which must not be dropped as a BOM
    'a﻿bom',
    // long enough to need memory growth, and too long to be spread as call arguments
    'é'.repeat(70_000),
    'abc中'.repeat(40_000),
];

const INTERFACES = [
    'utf8ToCompact',
    'utf16ToCompact',
    'utf16ViaUtf8',
    'utf16ViaUtf16',
    'utf8ViaUtf16',
    'utf8ViaCompact',
    'utf8ViaInflatedCompact',
    // these chains pass through components that allocate above 2GiB
    'utf8ViaHighCompact',
    'utf8ViaHighUtf16',
];

/**
 * Check that a call traps
 *
 * A trap leaves the component instances involved unusable, so every
 * call is made against newly instantiated components.
 */
async function assertTraps(call: (wasm: any) => unknown, expected: RegExp | typeof TypeError) {
    const wasm = await instantiate(loadWasm, {});
    assert.throws(() => call(wasm), expected);
}

async function run() {
    const wasm = await instantiate(loadWasm, {});

    for (const s of STRINGS) {
        const expected = compact(s);
        const label = JSON.stringify(s.length > 40 ? `${s.slice(0, 40)}...` : s);

        for (const name of INTERFACES) {
            const iface = wasm[name];
            assert.strictEqual(iface.taggedLen(s), expected.taggedLen, `${name}.taggedLen(${label})`);
            assert.deepStrictEqual(iface.raw(s), expected.raw, `${name}.raw(${label})`);
            assert.strictEqual(iface.echo(s), s, `${name}.echo(${label})`);
        }
    }

    // Between two utf8 components a string is copied as it is
    for (const s of STRINGS) {
        const label = JSON.stringify(s.length > 40 ? `${s.slice(0, 40)}...` : s);
        const bytes = new TextEncoder().encode(s);

        assert.strictEqual(wasm.utf8ToUtf8.taggedLen(s), bytes.length, `utf8ToUtf8.taggedLen(${label})`);
        assert.deepStrictEqual(wasm.utf8ToUtf8.raw(s), bytes, `utf8ToUtf8.raw(${label})`);
        assert.strictEqual(wasm.utf8ToUtf8.echo(s), s, `utf8ToUtf8.echo(${label})`);
    }

    // The same goes for two utf16 components
    for (const s of STRINGS) {
        const label = JSON.stringify(s.length > 40 ? `${s.slice(0, 40)}...` : s);

        assert.strictEqual(wasm.utf16ToUtf16.taggedLen(s), s.length, `utf16ToUtf16.taggedLen(${label})`);
        assert.strictEqual(wasm.utf16ToUtf16.echo(s), s, `utf16ToUtf16.echo(${label})`);
    }

    // A leading U+FEFF is part of the string, and must not be dropped as a BOM
    for (const s of ['\ufeff', '\ufeffbom', '\ufeff中文']) {
        const expected = compact(s);
        const label = JSON.stringify(s);

        for (const name of INTERFACES) {
            const iface = wasm[name];
            assert.strictEqual(iface.taggedLen(s), expected.taggedLen, `${name}.taggedLen(${label})`);
            assert.deepStrictEqual(iface.raw(s), expected.raw, `${name}.raw(${label})`);
            assert.strictEqual(iface.echo(s), s, `${name}.echo(${label})`);
        }
    }

    // Unpaired surrogates in a JS string are replaced when it is lowered by the host
    for (const [s, lowered] of [
        ['\ud800', '\ufffd'],
        ['a\ud800b', 'a\ufffdb'],
        ['\udc00\ud800', '\ufffd\ufffd'],
        ['\ud800🚀\udc00', '\ufffd🚀\ufffd'],
    ]) {
        const expected = compact(lowered);
        const label = JSON.stringify(s);

        for (const name of INTERFACES) {
            const iface = wasm[name];
            assert.deepStrictEqual(iface.raw(s), expected.raw, `${name}.raw(${label})`);
            assert.strictEqual(iface.echo(s), lowered, `${name}.echo(${label})`);
        }
    }

    // Dropping the last byte only leaves invalid UTF-8 if it was part of a multi-byte sequence
    assert.deepStrictEqual(wasm.utf8ToCompact.truncatedRaw('abc'), compact('ab').raw);
    assert.deepStrictEqual(wasm.utf8ViaUtf16.truncatedRaw('abc'), compact('ab').raw);
    assert.deepStrictEqual(wasm.utf8ViaHighCompact.truncatedRaw('abc'), compact('ab').raw);

    // Truncated sequences are not valid UTF-8, and must not be transcoded
    for (const s of ['é', 'abc中', 'abc🚀']) {
        // utf8 -> latin1+utf16
        await assertTraps((wasm) => wasm.utf8ToCompact.truncatedRaw(s), TypeError);
        // utf8 -> utf16
        await assertTraps((wasm) => wasm.utf8ViaUtf16.truncatedRaw(s), TypeError);
        // utf8 -> utf8
        await assertTraps((wasm) => wasm.utf8ToUtf8.truncatedRaw(s), TypeError);
        await assertTraps((wasm) => wasm.utf8ViaHighCompact.truncatedRaw(s), TypeError);
    }

    // Writing part of a surrogate into a string is fine as long as it ends up paired
    assert.deepStrictEqual(wasm.utf16ToCompact.pokedRaw('🚀', 0, 0x3e), compact('\ud83e\ude80').raw);
    assert.deepStrictEqual(wasm.utf16ViaUtf8.pokedRaw('🚀', 0, 0x3e), compact('\ud83e\ude80').raw);
    assert.deepStrictEqual(wasm.utf16ViaUtf16.pokedRaw('🚀', 0, 0x3e), compact('\ud83e\ude80').raw);

    // Unpaired surrogates are not valid UTF-16, and must not be transcoded
    for (const [s, at, byte] of [
        // a high surrogate that is not followed by a low surrogate
        ['ab', 1, 0xd8],
        // a high surrogate at the end of the string
        ['ab', 3, 0xd8],
        // a low surrogate that does not follow a high surrogate
        ['ab', 1, 0xdc],
        ['Āb', 3, 0xdc],
        // a high surrogate followed by another high surrogate
        ['🚀', 3, 0xd8],
    ] as const) {
        // utf16 -> latin1+utf16
        await assertTraps((wasm) => wasm.utf16ToCompact.pokedRaw(s, at, byte), /invalid utf16 encoding/);
        // utf16 -> utf8
        await assertTraps((wasm) => wasm.utf16ViaUtf8.pokedRaw(s, at, byte), TypeError);
        // utf16 -> utf16
        await assertTraps((wasm) => wasm.utf16ToUtf16.pokedRaw(s, at, byte), /invalid utf16 encoding/);
        await assertTraps((wasm) => wasm.utf16ViaUtf16.pokedRaw(s, at, byte), /invalid utf16 encoding/);
    }
}

await run();
