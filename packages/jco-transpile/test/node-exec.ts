import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import { getTmpDir, nodeExec } from './helpers.js';

test.concurrent.each([0, 1])('captures complete subprocess output with exit code %s', async (code) => {
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
        if (code === 0) {
            expect(await nodeExec(script)).toEqual({ stdout, stderr });
        } else {
            await expect(nodeExec(script)).rejects.toMatchObject({
                message: expect.stringContaining(`STDOUT:\n${stdout}\nSTDERR:\n${stderr}`),
            });
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
