import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { assert, test } from 'vitest';

import { writeCustomRuntime } from './helpers.js';

const execAsync = promisify(execFile);

test('custom provider loads every public module as a standalone package', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-provider-'));
    try {
        const provider = await writeCustomRuntime(join(dir, 'node_modules/test-runtime-provider'));
        const manifest = JSON.parse(await readFile(new URL('package.json', provider), 'utf8'));
        const imports = Object.keys(manifest.exports).map(
            (subpath) => `import ${JSON.stringify('test-runtime-provider/' + subpath.slice(2))};`,
        );
        // Native Node resolution has no workspace aliases or Vitest module transforms.
        await execAsync(process.execPath, ['--input-type=module', '-e', imports.join('\n')], { cwd: dir });
        for (const [subpath, target] of Object.entries(manifest.exports)) {
            const defaults = await import(new URL(`../../../jco-cm-runtime/dist/${target}`, import.meta.url).href);
            const custom = await import(new URL(target as string, provider).href);
            const observations =
                subpath === './intrinsics/resource'
                    ? ['contexts', 'tables', 'tableGetCallCount', 'resetTableGetCallCount']
                    : [];
            assert.sameMembers(Object.keys(custom), [...Object.keys(defaults), ...observations]);
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('custom resource observations preserve runtime behavior and stay isolated per provider', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-provider-'));
    try {
        const first = await writeCustomRuntime(join(dir, 'first'));
        const second = await writeCustomRuntime(join(dir, 'second'));
        const observed = await import(new URL('intrinsics/resource.js', first).href);
        const sibling = await import(new URL('intrinsics/resource.js', second).href);
        const { tableGet } = observed;
        const context = { RuntimeError: WebAssembly.RuntimeError };
        const table = Object.assign([], { _createdReps: new Set() });
        const spaces = observed.initializeHandleIndexSpaces();
        for (const rep of [0, 0xffffffff]) {
            const handle = observed.tableCreateOwn(spaces, table, rep);
            assert.deepEqual(tableGet(context, table, handle), { rep, scope: 0, own: true });
        }
        assert.strictEqual(observed.tableGetCallCount, 2);
        assert.deepEqual([...observed.contexts], [context]);
        assert.deepEqual([...observed.tables.get(context)], [table]);
        assert.strictEqual(sibling.tableGetCallCount, 0);
        assert.throws(() => tableGet(context, table, 0), WebAssembly.RuntimeError, 'unknown handle index 0');
        assert.throws(() => observed.tableGet(context, table, 1), 'named operations must not require a receiver');
        assert.throws(() => tableGet({ ...context, extra: true }, table, 1), 'exactly the documented trap capability');
        observed.resetTableGetCallCount();
        assert.strictEqual(observed.tableGetCallCount, 0);
        assert.strictEqual(observed.contexts.size, 0);
        assert.strictEqual(observed.tables.size, 0);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
