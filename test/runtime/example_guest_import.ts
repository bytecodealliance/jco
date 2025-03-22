// Flags: --map example2:component/backend=../example_guest_import.js

import { ok, strictEqual } from 'node:assert';

// @ts-ignore
import * as wasm from '../output/example_guest_import/example_guest_import.js';

let instance = 0;

export class Scalars {
    instance: number;
    constructor() {
        this.instance = instance++;
    }
    getB() {
        return this.instance;
    }
}

let received: Scalars[] = [];
export function fetch(scalar: Scalars) {
    received.push(scalar);
    return new Scalars();
}

async function run() {
    const x = new Scalars();
    const y = new Scalars();
    strictEqual(wasm.front.handle(x), 2);
    strictEqual(wasm.front.handle(y), 4);

    // this seems weird but is ok actually
    // we got a borrow to our own defined resource
    // so since that punches outside of the component-internal handle scheme
    // we are able to convert that borrow into a local GCable reference again
    // even though strictly speaking it breaks the borrow semantics
    strictEqual(received.length, 2);
    strictEqual(wasm.front.handle(received[0]), 4);
    strictEqual(wasm.front.handle(received[1]), 6);
}

// Async cycle handling
setTimeout(run);
