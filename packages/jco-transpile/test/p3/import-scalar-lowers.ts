import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';

// Regression coverage for the flat lowering of 1-byte async host import
// results (`bool`, `u8`, `s8`) and elementwise-lowered `list<u8>` results:
// the runtime must write these into guest memory with 1-byte stores. The
// previous `DataView.setUint32` writes overflowed 3 bytes past the guest's
// exactly-sized return-area/list allocations, silently corrupting the guest
// heap (layout-dependent dlmalloc `unlink_chunk` traps much later).
//
// The `async-scalar-lowers` fixture guest detects any such overflow
// deterministically via a rear-canary global allocator and asserts zero
// violations (see crates/test-components/src/bin/async_scalar_lowers.rs and
// crates/js-component-bindgen/src/intrinsics/lower.rs).
suite('async host import 1-byte scalar result lowering', () => {
    test.concurrent('bool/u8/s8/list<u8> results are written with exact widths', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-scalar-lowers.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/async-scalar-lowers-host': {
                        getBool: async () => true,
                        getU8: async () => 0xab,
                        getS8: async () => -5,
                        getListU8: async () => new Uint8Array(Array.from({ length: 32 }, (_, i) => i)),
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });

        try {
            const run = instance['jco:test-components/local-run-async'].run;
            assert.instanceOf(run, AsyncFunction);
            await Promise.race([
                run(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('export call timed out')), 10_000)),
            ]);
        } finally {
            await cleanup();
        }
    });
});
