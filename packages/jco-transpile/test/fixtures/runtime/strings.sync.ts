// Flags: --instantiation sync

import * as helpers from './helpers.js';
import { instantiate } from '../js-test-components/strings.sync/strings.sync.js';

// @ts-expect-error
import * as assert from 'assert';

function run() {
    // @ts-expect-error
    const wasm = instantiate(helpers.loadWasmSync, {
        'test:strings/imports': {
            takeBasic(s: string) {
                assert.strictEqual(s, 'latin utf16');
            },
            returnUnicode() {
                return '🚀🚀🚀 𠈄𓀀';
            },
        },
    });

    wasm.testImports();
    assert.strictEqual(wasm.roundtrip('str'), 'str');
    assert.strictEqual(wasm.roundtrip('🚀🚀🚀 𠈄𓀀'), '🚀🚀🚀 𠈄𓀀');
}

run();
