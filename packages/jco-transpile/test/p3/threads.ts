import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { assert, suite, test } from 'vitest';

import { transpileBytes } from '../transpilation.js';
import { parse } from '../../src/wasm-tools.js';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

/** Transpiles a hand-written component and returns its generated JS. */
async function transpiledSource(fixture: string, name: string): Promise<string> {
    const component = await parse(await readFile(join(P3_COMPONENT_FIXTURES_DIR, fixture), 'utf8'));
    const { files } = await transpileBytes(component, { name, asyncMode: 'jspi', minify: false });
    const decoder = new TextDecoder();
    return Object.entries(files)
        .filter(([fileName]) => fileName.endsWith('.js'))
        .map(([, source]) => (typeof source === 'string' ? source : decoder.decode(source)))
        .join('\n');
}

// Regression tests for the cooperative threading built-ins (`thread.*`) and
// the per-thread bookkeeping behind them.
suite.skipIf(typeof WebAssembly.Suspending !== 'function')('Threads (WASI P3)', () => {
    test.concurrent('a stackful export that keeps yielding after task.return delivers its result', async () => {
        let released = false;
        let finish!: () => void;
        const finished = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'thread-yield-after-return',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'thread-yield-after-return.wat'),
                imports: {
                    check: { default: () => released },
                    done: { default: () => finish() },
                },
            },
        });
        try {
            // The result arrives at `task.return`, while the task is still
            // looping on `thread.yield` (the host has not released it yet).
            assert.strictEqual(await instance.run(), 42);
            released = true;
            // The yielding thread keeps being scheduled until it observes the release.
            await finished;
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a yielding stackful export can be called again once it finished', async () => {
        const released = true;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'thread-yield-after-return-twice',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'thread-yield-after-return.wat'),
                imports: {
                    check: { default: () => released },
                    done: { default: () => {} },
                },
            },
        });
        try {
            assert.strictEqual(await instance.run(), 42);
            assert.strictEqual(await instance.run(), 42);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('an export re-enters Wasm under the thread it was created with', async () => {
        // Argument lowering may suspend (realloc) and let another task of the
        // same component run, which can overwrite and then clear the component's
        // ambient thread register. The reinstall before entering Wasm must
        // therefore use the thread id the export's task was created with, never
        // re-read the register.
        const source = await transpiledSource('stackful-lift.wat', 'thread-reinstall');
        assert.notInclude(source, '_getGlobalCurrentThreadMeta(task.componentIdx()).threadID');
        assert.include(source, 'const { task, threadID } = createNewCurrentImplicitThread({');
        assert.match(
            source,
            /_withGlobalCurrentThreadMeta\((?:CURRENT_TASK_META, )?\{\s*taskID: task\.id\(\),\s*threadID,\s*componentIdx: task\.componentIdx\(\),\s*fn: \(\) => /,
        );
    });

    test.concurrent('thread built-ins that take an index trap on unknown indices', async () => {
        // (the wast fixture `thread-handle-traps.wast` covers the traps themselves
        // and `cooperative-threading.ts` a spawned thread's; this checks that the
        // trampolines record a trap against the instance)
        const source = await transpiledSource('cooperative-threading/raw-trap.wat', 'thread-guards');
        assert.match(source, /_guardTrap\(\d+, threadNewIndirect\.bind\(/);
        assert.match(source, /_guardTrap\(\d+, threadResumeLater\.bind\(/);
    });
});
