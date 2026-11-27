import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assert, describe, test } from 'vitest';

import { forceSyncFastPath } from '../transpilation.js';
import { COMPONENT_FIXTURES_DIR } from '../common.js';
import { generate, generatePair, readFixture, remove } from './helpers.js';

describe('--perf-sync-fast-path: when it applies', () => {
    test('is off by default', async () => {
        const wat = await readFixture('calls');
        // (unless the suite itself runs with the option forced on)
        const expected = await generate('calls', wat, { instantiation: 'async', perfSyncFastPath: forceSyncFastPath });
        const actual = await generate('calls', wat, { instantiation: 'async' });
        try {
            assert.strictEqual(actual.source, expected.source);
        } finally {
            await remove(expected, actual);
        }
    });

    test.each([
        ['an async function', 'post-return-traps/stack-async.wat', {}],
        ['several component instances', 'post-return-traps/composed-sync.wat', {}],
        ['call tracking', 'sync-fast-path/calls.wat', { callTracking: true }],
        ['asm.js output', 'sync-fast-path/calls.wat', { js: true }],
        ['a JSPI export', 'sync-fast-path/calls.wat', { asyncMode: 'jspi', asyncExports: ['add'] }],
    ] as const)('leaves bindings unchanged with %s', async (_name, fixture, options) => {
        const wat = await readFile(join(COMPONENT_FIXTURES_DIR, fixture), 'utf8');
        const [without, withOption] = await generatePair('component', wat, { instantiation: 'async', ...options });
        try {
            assert.strictEqual(withOption.source, without.source);
        } finally {
            await remove(without, withOption);
        }
    });
});
