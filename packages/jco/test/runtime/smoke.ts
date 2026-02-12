// Flags: --tla-compat --map testwasi=../helpers.js --map test:smoke/imports=../smoke.js --base64-cutoff=2500

// @ts-ignore
import { $init, thunk as importedThunk } from '../output/smoke/smoke.js';

function assert(x: boolean, msg: string) {
    if (!x) {throw new Error(msg);}
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
