// Flags: --map testwasi=../helpers.js --map r=../resource_borrow_simple.js#R test=../resource_borrow_simple.js#test

// @ts-ignore
import { testImports } from '../output/resource_borrow_simple/resource_borrow_simple.js';

// @ts-nocheck
import * as assert from 'assert';

/*
WIT definition (for reference):

package root:component;

world root {
  import wasi:cli/environment@0.2.0;
  import wasi:cli/exit@0.2.0;
  import wasi:io/error@0.2.0;
  import wasi:io/streams@0.2.0;
  import wasi:cli/stdin@0.2.0;
  import wasi:cli/stdout@0.2.0;
  import wasi:cli/stderr@0.2.0;
  import wasi:clocks/wall-clock@0.2.0;
  import wasi:filesystem/types@0.2.0;
  import wasi:filesystem/preopens@0.2.0;
  import test: func(r: borrow<r>);

  resource r {
    constructor();
  }

  export test-imports: func();
}
*/

// Imports
let constructed = false;
export class R {
    constructor() {
        constructed = true;
    }
}

let tested = false;
export function test(r) {
    assert.ok(r instanceof R);
    tested = true;
}

export async function run() {
    testImports();
    assert.ok(constructed);
    assert.ok(tested);
}

// TLA cycle avoidance
setTimeout(run);
