// Flags: --instantiation

// @ts-ignore
import * as assert from 'assert';

// @ts-ignore
import { instantiate } from '../output/strings/strings.js';
// @ts-ignore
import { loadWasm } from './helpers.js';
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation"

async function run() {
    // @ts-ignore
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
