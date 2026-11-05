import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, suite, test } from 'vitest';

import { getTmpDir, nodeExec } from './helpers.js';

suite('Node script execution', () => {
    test.concurrent.each([
        [0, 0],
        [1, 0],
        [3, 3],
    ])('captures complete subprocess output with exit code %s (expected %s)', async (code, expectedExitCode) => {
        const directory = await getTmpDir();
        const stdout = 'o'.repeat(256 * 1024) + '\nstdout complete\n';
        const stderr = 'e'.repeat(256 * 1024) + '\nstderr complete\n';
        try {
            const script = join(directory, 'output.mjs');
            await writeFile(
                script,
                `process.stdout.write(${JSON.stringify(stdout)});
process.stderr.write(${JSON.stringify(stderr)});
process.exitCode = ${code};
`,
            );
            if (code === expectedExitCode) {
                expect(await nodeExec(script, { expectedExitCode })).toEqual({ stdout, stderr });
            } else {
                await expect(nodeExec(script)).rejects.toMatchObject({
                    message: expect.stringContaining(`STDOUT:\n${stdout}\nSTDERR:\n${stderr}`),
                });
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
