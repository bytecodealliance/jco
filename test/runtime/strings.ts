// Flags: --instantiation

import * as helpers from './helpers.js';
import { instantiate } from '../output/strings/strings.js';

// @ts-ignore
import * as assert from 'assert';

async function run() {
  const wasm = await instantiate(helpers.loadWasm, {
    ...helpers.wasi,
    'test:strings/imports': {
      takeBasic(s: string) {
        assert.strictEqual(s, 'latin utf16');
      },
      returnUnicode() {
        return '🚀🚀🚀 𠈄𓀀';
      }
    }
  });

  wasm.testImports();
  assert.strictEqual(wasm.roundtrip('str'), 'str');
  assert.strictEqual(wasm.roundtrip('🚀🚀🚀 𠈄𓀀'), '🚀🚀🚀 𠈄𓀀');
}

await run()
