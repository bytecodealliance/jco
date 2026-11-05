import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';
import { executeNodeScript } from '../../../../test/helpers/node.mjs';
import { withWorkspacePreview3Shim } from '../../../../test/helpers/shims.mjs';

/** Execute the native output fixture with an isolated runner and expected exit status. */
function runOutputFixture(
    dir: string,
    mode: string,
    { setup, expectedExitCode = 0 }: { setup?: string; expectedExitCode?: number } = {},
) {
    return executeNodeScript(
        fileURLToPath(new URL('../../../jco/dist/jco.js', import.meta.url)),
        'run',
        '--jco-dir',
        join(dir, 'run'),
        ...(setup ? ['--jco-import', setup] : []),
        join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-2393/component.wasm'),
        `output-${mode}`,
        { expectedExitCode },
    );
}

/** Reconstruct the fixture's ordered payload for one output destination. */
function expectedLargeOutput(prefix: string) {
    return Array.from({ length: 16 }, (_, index) => `${prefix} ${index}:${'x'.repeat(64 * 1024)}\n`).join('');
}

// TODO(fix): Switch to withInstalledPreview3Shim after the next preview3-shim release
// includes the output lifecycle helpers and jco-transpile consumes that published version.
suite('jco issue 2397', () => {
    test.concurrent.each(['return', 'large-return'])('drains both output streams after %s', async (mode) => {
        await withWorkspacePreview3Shim(async (dir) => {
            const result = await runOutputFixture(dir, mode);
            assert.strictEqual(result.stdout, mode.startsWith('large') ? expectedLargeOutput('out') : 'out: return\n');
            assert.strictEqual(result.stderr, mode.startsWith('large') ? expectedLargeOutput('err') : 'err: return\n');
        });
    });

    test.concurrent.each(['exit', 'large-exit'])('preserves abrupt %s without invoking shutdown', async (mode) => {
        await withWorkspacePreview3Shim(async (dir) => {
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
            await runOutputFixture(dir, mode, { setup, expectedExitCode: 3 });
        });
    });

    test.concurrent('explicit host flush preserves both streams before a nonzero exit', async () => {
        await withWorkspacePreview3Shim(async (dir) => {
            const script = join(dir, 'flush-before-exit.mjs');
            await writeFile(
                script,
                `
                import { _flush, exit } from '@bytecodealliance/preview3-shim/cli';
                process.stdout.write(${JSON.stringify(expectedLargeOutput('out'))});
                process.stderr.write(${JSON.stringify(expectedLargeOutput('err'))});
                await _flush();
                exit.exitWithCode(3);
            `,
            );
            const result = await executeNodeScript(script, { expectedExitCode: 3 });
            assert.strictEqual(result.stdout, expectedLargeOutput('out'));
            assert.strictEqual(result.stderr, expectedLargeOutput('err'));
        });
    });
});
