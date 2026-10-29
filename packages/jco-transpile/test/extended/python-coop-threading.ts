import { execFile } from 'node:child_process';
import { rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execArgv, execPath } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, suite, test, assert } from 'vitest';

import { transpile, writeFiles } from '../../src/index.js';
import { ensureFile, getTmpDir } from '../helpers.js';
import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';

const execFileAsync = promisify(execFile);

suite('componentize-py cooperative threading', () => {
    let outputDir: string;

    beforeAll(async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, 'python-coop-threading/component.wasm');
        await ensureFile(componentPath);
        outputDir = await getTmpDir();
        // Exercise the workspace bindgen, with WASI shims resolvable by the child.
        await symlink(
            fileURLToPath(new URL('../../node_modules', import.meta.url)),
            join(outputDir, 'node_modules'),
            'dir',
        );
        const { files } = await transpile(componentPath, { name: 'out' });
        await writeFiles(files, { baseDir: outputDir });
    });

    afterAll(async () => {
        if (outputDir) {
            await rm(outputDir, { recursive: true, force: true });
        }
    });

    async function runCase(name: string): Promise<string[][]> {
        const moduleUrl = pathToFileURL(join(outputDir, 'out.js')).href;
        // A broken cooperative wait can block the JS event loop, so enforce the
        // deadline from a parent process. Repeat on one instance to catch stale
        // thread handles/TLS left behind after a successful exported call.
        const { stdout, stderr } = await execFileAsync(
            execPath,
            [
                ...execArgv,
                '--input-type=module',
                '--eval',
                `import { writeSync } from 'node:fs';
                 import { run } from ${JSON.stringify(moduleUrl)};
                 const results = [];
                 for (let i = 0; i < 2; i++) results.push(await run(${JSON.stringify(name)}));
                 writeSync(1, JSON.stringify(results));`,
            ],
            { timeout: 30_000, killSignal: 'SIGKILL' },
        );
        assert.isNotEmpty(stdout, stderr || 'component runner produced no results');
        const results = JSON.parse(stdout);
        assert.lengthOf(results, 2);
        return results;
    }

    test('starts, sleeps, and joins threads (upstream multithreading example)', async () => {
        for (const trace of await runCase('start-join')) {
            assert.sameMembers(trace, [
                'a:started',
                'a:finished',
                'b:started',
                'b:finished',
                'c:started',
                'c:finished',
                'main:started-all',
                'main:joined-all',
            ]);
            for (const name of ['a', 'b', 'c']) {
                assert.isBelow(trace.indexOf(`${name}:started`), trace.indexOf(`${name}:finished`));
            }
            assert.strictEqual(trace.at(-1), 'main:joined-all');
        }
    });

    test('hands a held lock to a waiting thread', async () => {
        for (const trace of await runCase('lock-handoff')) {
            assert.deepEqual(trace, ['worker:waiting', 'main:releasing', 'worker:acquired', 'main:joined']);
        }
    });

    test('notifies a condition waiter and reacquires its lock', async () => {
        for (const trace of await runCase('condition-notify')) {
            assert.deepEqual(trace, ['worker:waiting', 'main:notifying', 'worker:received:hello', 'main:joined']);
        }
    });

    test('preserves thread-local values and identities across a barrier', async () => {
        for (const values of await runCase('thread-local')) {
            assert.deepEqual(values, ['main', 'a', 'b', 'c']);
        }
    });
});
