import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, assert, beforeAll, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { parse, print } from '../../src/wasm-tools.js';
import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const examples = [
    ['', false],
    ['A\u0080\u009féÿ', false],
    ['\ufeffA😀β', true],
    ['Aé', false],
] as const;

suite('compact Latin-1/UTF-16 strings', () => {
    let dir: string;
    let path: string;
    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'jco-compact-strings-'));
        path = join(dir, 'compact-strings.wasm');
        const original = await print(await readFile(join(LOCAL_TEST_COMPONENTS_DIR, 'compact-strings.wasm')));
        // Rust writes the raw compact payloads. Change only the stream canonical
        // options: ordinary Rust function strings still use UTF-8.
        const compact = original.replace(/^.*\(canon stream\.(?:read|write) .*$/gm, (line) =>
            line.replace('string-encoding=utf8', 'string-encoding=latin1+utf16'),
        );
        assert.notStrictEqual(compact, original);
        await writeFile(path, await parse(compact));
    });
    afterAll(async () => {
        if (dir) {
            await rm(dir, { recursive: true, force: true });
        }
    });

    async function setup() {
        return setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'compact-strings',
                path,
                imports: { ...new WASIShim().getImportObject() },
            },
            jco: { transpile: { extraArgs: { asyncExports: ['consume'], validLiftingOptimization: false } } },
        });
    }

    test.concurrent('round-trips error messages, including C1 bytes, BOMs, and surrogate pairs', async () => {
        const { instance, cleanup } = await setup();
        try {
            for (const [index, expected] of examples.entries()) {
                assert.deepEqual(instance.errorMessage(index), expected);
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each([4, 5, 6])(
        'rejects malformed UTF-16, out-of-bounds, or unaligned input (case %s)',
        async (index) => {
            const { instance, cleanup } = await setup();
            try {
                assert.throws(() => instance.errorMessage(index));
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent('lifts stream strings from both compact representations', async () => {
        const { instance, cleanup } = await setup();
        try {
            for (const [index, [text]] of examples.entries()) {
                const stream = instance.produce(index);
                assert.deepEqual(await stream.next(), { value: text, done: false });
                instance.finish();
                assert.deepEqual(await stream.next(), { value: undefined, done: true });
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent('lowers stream strings using Latin-1 when possible and tagged UTF-16 otherwise', async () => {
        const { instance, cleanup } = await setup();
        try {
            for (const [text, tagged] of examples) {
                const stream = {
                    async *[Symbol.asyncIterator]() {
                        yield text;
                    },
                };
                assert.deepEqual(await instance.consume(stream), [text, tagged]);
            }
        } finally {
            await cleanup();
        }
    });
});
