import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';

suite('jco issue 2397', () => {
    test.each(['return', 'exit', 'large-return', 'large-exit'])(
        'drains both output streams before %s',
        async (mode) => {
            const dir = await mkdtemp(join(tmpdir(), 'jco-output-'));
            try {
                const modules = join(dir, 'node_modules/@bytecodealliance');
                await mkdir(modules, { recursive: true });
                await symlink(
                    fileURLToPath(new URL('../../../preview3-shim', import.meta.url)),
                    join(modules, 'preview3-shim'),
                    'dir',
                );
                const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>(
                    (resolve, reject) => {
                        execFile(
                            process.execPath,
                            [
                                fileURLToPath(new URL('../../../jco/dist/jco.js', import.meta.url)),
                                'run',
                                '--jco-dir',
                                join(dir, 'run'),
                                join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-2393/component.wasm'),
                                `output-${mode}`,
                            ],
                            { maxBuffer: 4 * 1024 * 1024 },
                            (error, stdout, stderr) => {
                                if (error && typeof error.code !== 'number') {
                                    reject(error);
                                    return;
                                }
                                resolve({ status: error?.code ?? 0, stdout, stderr });
                            },
                        );
                    },
                );
                const exits = mode.endsWith('exit');
                assert.strictEqual(result.status, exits ? 3 : 0);
                for (const stream of ['out', 'err']) {
                    const expected = mode.startsWith('large')
                        ? Array.from(
                              { length: 16 },
                              (_, index) => `${stream} ${index}:${'x'.repeat(64 * 1024)}\n`,
                          ).join('')
                        : `${stream}: ${exits ? 'exit' : 'return'}\n`;
                    assert.strictEqual(stream === 'out' ? result.stdout : result.stderr, expected);
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
});
