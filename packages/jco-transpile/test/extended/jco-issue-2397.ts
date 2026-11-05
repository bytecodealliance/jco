import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';

function execute(args: string[]) {
    return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        execFile(process.execPath, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error && typeof error.code !== 'number') {
                reject(error);
                return;
            }
            resolve({ status: error?.code ?? 0, stdout, stderr });
        });
    });
}

async function withShim(run: (dir: string) => Promise<void>) {
    const dir = await mkdtemp(join(tmpdir(), 'jco-output-'));
    try {
        const modules = join(dir, 'node_modules/@bytecodealliance');
        await mkdir(modules, { recursive: true });
        await symlink(
            fileURLToPath(new URL('../../../preview3-shim', import.meta.url)),
            join(modules, 'preview3-shim'),
            'dir',
        );
        await run(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

function runCommand(dir: string, mode: string, setup?: string) {
    return execute([
        fileURLToPath(new URL('../../../jco/dist/jco.js', import.meta.url)),
        'run',
        '--jco-dir',
        join(dir, 'run'),
        ...(setup ? ['--jco-import', setup] : []),
        join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-2393/component.wasm'),
        `output-${mode}`,
    ]);
}

function largeOutput(prefix: string) {
    return Array.from({ length: 16 }, (_, index) => `${prefix} ${index}:${'x'.repeat(64 * 1024)}\n`).join('');
}

suite('jco issue 2397', () => {
    test.each(['return', 'large-return'])('drains both output streams after %s', async (mode) => {
        await withShim(async (dir) => {
            const result = await runCommand(dir, mode);
            assert.strictEqual(result.status, 0);
            assert.strictEqual(result.stdout, mode.startsWith('large') ? largeOutput('out') : 'out: return\n');
            assert.strictEqual(result.stderr, mode.startsWith('large') ? largeOutput('err') : 'err: return\n');
        });
    });

    test.each(['exit', 'large-exit'])('preserves abrupt %s without invoking shutdown', async (mode) => {
        await withShim(async (dir) => {
            const setup = join(dir, 'no-shutdown.mjs');
            await writeFile(
                setup,
                `
                import { stdout, stderr } from '@bytecodealliance/preview3-shim/cli';
                stdout._shutdown = stderr._shutdown = () => {
                    throw new Error('abrupt exit must not invoke output shutdown');
                };
            `,
            );
            const result = await runCommand(dir, mode, setup);
            assert.strictEqual(result.status, 3);
        });
    });

    test('explicit host flush preserves both streams before a nonzero exit', async () => {
        await withShim(async (dir) => {
            const script = join(dir, 'flush-before-exit.mjs');
            await writeFile(
                script,
                `
                import { _flush, exit } from '@bytecodealliance/preview3-shim/cli';
                process.stdout.write(${JSON.stringify(largeOutput('out'))});
                process.stderr.write(${JSON.stringify(largeOutput('err'))});
                await _flush();
                exit.exitWithCode(3);
            `,
            );
            const result = await execute([script]);
            assert.strictEqual(result.status, 3);
            assert.strictEqual(result.stdout, largeOutput('out'));
            assert.strictEqual(result.stderr, largeOutput('err'));
        });
    });
});
