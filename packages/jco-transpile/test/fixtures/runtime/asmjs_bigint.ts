// Flags: --js --instantiation

// @ts-expect-error
import { instantiate } from '../js-test-components/asmjs_bigint/asmjs_bigint.js';

// @ts-expect-error
import { strictEqual } from 'node:assert';

async function run() {
    const wasm = await instantiate({});

    strictEqual(wasm.add(1n, 2n), 3n);
    strictEqual(wasm.add(1n << 33n, -(1n << 42n)), -4389456576512n);
}

await run();
