// Flags: --tla-compat

import * as assert from 'assert';

// @ts-expect-error
import * as wasm from '../js-test-components/string-transcoding/string-transcoding.js';

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
    // long enough to need memory growth
    'é'.repeat(70_000),
    'abc中'.repeat(10_000),
];

async function run() {
    await wasm.$init;

    for (const s of STRINGS) {
        const expected = compact(s);
        const label = JSON.stringify(s.length > 40 ? `${s.slice(0, 40)}...` : s);

        for (const name of ['utf8ToCompact', 'utf8ViaCompact', 'utf8ViaInflatedCompact', 'utf16ToCompact']) {
            const iface = wasm[name];
            assert.strictEqual(iface.taggedLen(s), expected.taggedLen, `${name}.taggedLen(${label})`);
            assert.deepStrictEqual(iface.raw(s), expected.raw, `${name}.raw(${label})`);
            if (iface.echo) {
                assert.strictEqual(iface.echo(s), s, `${name}.echo(${label})`);
            }
        }
    }

    // Unpaired surrogates are not valid UTF-16, and must not be transcoded
    for (const s of ['\ud800', 'a\ud800', '\ud800a', '\udc00', 'Ā\udc00\ud800', '\ud800𐀀']) {
        assert.throws(() => wasm.utf16ToCompact.raw(s), /invalid utf16 encoding/);
    }
}

// Async cycle handling
setTimeout(run);
