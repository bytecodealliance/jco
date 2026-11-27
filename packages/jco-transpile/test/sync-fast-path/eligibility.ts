import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assert, describe, test, vi } from 'vitest';

import { forceSyncFastPath, transpileBytes } from '../transpilation.js';
import { parse } from '../../src/wasm-tools.js';
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

describe('--perf-sync-fast-path: why it does not apply', () => {
    /** Transpile the `calls` fixture with the option on, under further options. */
    async function transpileCalls(options: Parameters<typeof transpileBytes>[1] = {}) {
        return transpileBytes(await parse(await readFixture('calls')), {
            name: 'calls',
            instantiation: 'async',
            perfSyncFastPath: true,
            ...options,
        });
    }

    test('the result names no blocker for an eligible component', async () => {
        const result = await transpileCalls();
        assert.notProperty(result, 'syncFastPathBlocker');
    });

    test('the result names the blocker for an ineligible component', async () => {
        const result = await transpileCalls({ callTracking: true });
        assert.strictEqual(result.syncFastPathBlocker, 'call tracking is enabled');
    });

    test('the result names no blocker when the option is off', async () => {
        const result = await transpileCalls({ callTracking: true, perfSyncFastPath: false });
        assert.notProperty(result, 'syncFastPathBlocker');
    });

    test.each([
        ['logs the blocker with JCO_DEBUG set', '1'],
        ['does not log without JCO_DEBUG', ''],
    ])('%s', async (_name, jcoDebug) => {
        vi.stubEnv('JCO_DEBUG', jcoDebug);
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
        try {
            await transpileCalls({ callTracking: true });
            const messages = debug.mock.calls.map((args) => String(args[0]));
            const expected =
                'component [calls] does not use the sync fast path (perfSyncFastPath): call tracking is enabled';
            if (jcoDebug) {
                assert.include(messages, expected);
            } else {
                assert.notInclude(messages, expected);
            }
        } finally {
            debug.mockRestore();
            vi.unstubAllEnvs();
        }
    });
});
