// Flags: --map example2:component/backend@0.1.0=../example_guest_import.js

import { strictEqual } from 'node:assert';

let instance = 0;

export class Scalars {
  instance: number;
  constructor () {
    this.instance = instance++;
  }
  getB () {
    return this.instance;
  }
}

async function run() {
  const wasm = await import('../output/example_guest_import/example_guest_import.js');

  const x = new Scalars();
  const y = new Scalars();
  strictEqual(wasm.front.handle(x), 0);
  strictEqual(wasm.front.handle(y), 1);
}

// Async cycle handling
setTimeout(run);
