import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { exec } from "./helpers.js";

test.each([0, 1])("exec drains inherited output pipes after exit with code %s", async (code) => {
    const directory = await mkdtemp(join(tmpdir(), "jco-exec-"));
    try {
        const runner = join(directory, "runner.mjs");
        await writeFile(
            runner,
            `import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(`
setTimeout(() => {
    process.stdout.write('complete stdout');
    process.stderr.write('complete stderr');
}, 100);
`)}], { stdio: ['ignore', 1, 2] });
child.unref();
process.exitCode = ${code};
`,
        );
        if (code === 0) {
            await expect(exec(runner)).resolves.toEqual({
                stdout: "complete stdout",
                stderr: "complete stderr",
            });
        } else {
            await expect(exec(runner)).rejects.toThrow("STDOUT:\ncomplete stdout\nSTDERR:\ncomplete stderr");
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
