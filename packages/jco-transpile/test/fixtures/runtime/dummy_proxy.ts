// Flags: --instantiation

import * as assert from 'node:assert';
// @ts-expect-error
import { importObject } from '@bytecodealliance/preview2-shim';

// @ts-expect-error
import { instantiate } from '../js-test-components/dummy_proxy/dummy_proxy.js';
import * as helpers from './helpers.js';

async function run() {
    const wasm = await instantiate(helpers.loadWasm, importObject);

    // TODO: Should be changed when incoming HTTP is implemented
    assert.equal(wasm.HTTP, undefined);
    // const run = () => wasm.HTTP.handle(0, 1);
    // assert.throws(run, Error(""));
}

await run();
