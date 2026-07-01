// Flags: --instantiation

// @ts-expect-error
import * as assert from 'assert';

// @ts-expect-error
import { instantiate } from '../js-test-components/strings/strings.js';
// @ts-expect-error
import { loadWasm } from './helpers.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

async function run() {
    // @ts-expect-error
    const wasm = await instantiate(loadWasm, {
        ...new WASIShim().getImportObject(),
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

await run();
