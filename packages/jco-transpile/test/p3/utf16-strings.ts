import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

// NOTE: a leading U+FEFF is part of the string, and must not be dropped as a BOM
const STRINGS = ['', 'a', 'hello, world', 'café', 'asdf中文🀄️⏰', '﻿bom', 'é'.repeat(70_000)];

suite('utf16 strings (WASI P3)', () => {
    async function setup() {
        const received: string[] = [];
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'utf16-strings',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'utf16-strings.wat'),
                imports: {
                    host: {
                        echoString: async (v: string) => {
                            received.push(v);
                            return v;
                        },
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
        return { instance, cleanup, received };
    }

    test('async exports return strings as flat values', async () => {
        const { instance, cleanup } = await setup();
        try {
            for (const s of STRINGS) {
                assert.strictEqual(await instance.echoString(s), s);
            }
        } finally {
            await cleanup();
        }
    });

    test('async exports return strings stored in memory', async () => {
        const { instance, cleanup } = await setup();
        try {
            for (const strings of [[], [''], STRINGS]) {
                assert.deepStrictEqual(await instance.echoStrings(strings), strings);
            }
        } finally {
            await cleanup();
        }
    });

    test('async host imports take and return strings', async () => {
        const { instance, cleanup, received } = await setup();
        try {
            for (const s of STRINGS) {
                received.length = 0;
                assert.strictEqual(await instance.echoStringViaHost(s), s);
                assert.deepStrictEqual(received, [s]);
            }
        } finally {
            await cleanup();
        }
    });

    test('error contexts keep their debug message', async () => {
        const { instance, cleanup } = await setup();
        try {
            for (const s of STRINGS) {
                assert.strictEqual(instance.errorContextMessage(s), s);
            }
        } finally {
            await cleanup();
        }
    });

    test('strings that are valid once written to are lifted as they are', async () => {
        const { instance, cleanup } = await setup();
        try {
            assert.strictEqual(await instance.pokeString('ab', 0, 0x63), 'cb');
            // still a surrogate pair once the first byte of its high surrogate has changed
            assert.strictEqual(await instance.pokeString('🚀', 0, 0x3e), '🪀');
        } finally {
            await cleanup();
        }
    });

    test.each([
        { name: 'a high surrogate that is not followed by a low surrogate', s: 'ab', at: 1, byte: 0xd8 },
        { name: 'a high surrogate at the end of the string', s: 'ab', at: 3, byte: 0xd8 },
        { name: 'a low surrogate that does not follow a high surrogate', s: 'ab', at: 1, byte: 0xdc },
        { name: 'a high surrogate followed by another high surrogate', s: '🚀', at: 3, byte: 0xd8 },
    ])('strings with $name are not lifted', async ({ s, at, byte }) => {
        const { instance, cleanup } = await setup();
        try {
            let error: unknown;
            try {
                await instance.pokeString(s, at, byte);
            } catch (err) {
                error = err;
            }
            assert.instanceOf(error, TypeError);
        } finally {
            await cleanup();
        }
    });
});
