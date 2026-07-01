// Flags: --tla-compat --map testwasi=../helpers.js --map test:smoke/imports=../smoke.js --base64-cutoff=2500

// @ts-expect-error
import { $init, thunk as importedThunk } from '../js-test-components/smoke/smoke.js';

function assert(x: boolean, msg: string) {
    if (!x) {
        throw new Error(msg);
    }
}

let hit = false;

export function thunk() {
    hit = true;
}

async function run() {
    await $init;

    importedThunk();
    assert(hit, 'import not called');
}

// Async cycle handling
setTimeout(run);
