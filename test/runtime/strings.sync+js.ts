// Flags: --js --instantiation sync

import * as helpers from './helpers.js';
import { instantiate } from '../output/strings.sync+js/strings.sync+js.js';

// @ts-ignore
import * as assert from 'assert';

function run() {
  const wasm = instantiate(helpers.loadWasmSync, {
    testwasi: helpers,
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

run()
