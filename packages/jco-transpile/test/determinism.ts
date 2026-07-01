import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Buffer } from 'node:buffer';

import { transpileBytes } from '../src/index.js';
import { LOCAL_TEST_COMPONENTS_DIR } from './common.js';

import { suite, test, assert } from 'vitest';

suite('codegen determinism', () => {
    // see: https://github.com/bytecodealliance/jco/pull/1373
    test.concurrent('consistent output', async () => {
        // NOTE: we need to use a significant enough component here to expose indeterminism
        const [streamTx, streamRx] = await Promise.all([
            readFile(join(LOCAL_TEST_COMPONENTS_DIR, `stream-lower.wasm`)).then((bytes: Buffer) => {
                return Promise.all([transpileBytes(bytes), transpileBytes(bytes)]);
            }),
            readFile(join(LOCAL_TEST_COMPONENTS_DIR, `stream-lower.wasm`)).then((bytes: Buffer) => {
                return Promise.all([transpileBytes(bytes), transpileBytes(bytes)]);
            }),
        ]);
        assert.deepEqual(streamTx[0].files, streamTx[1].files);
        assert.deepEqual(streamRx[0].files, streamRx[1].files);
    });
});
