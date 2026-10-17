import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const jco = fileURLToPath(new URL('../../../../packages/jco/dist/jco.js', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'perry-example-wit-'));
try {
    // Copy the bundled reference world without maintaining a second WASI snapshot.
    execFileSync(
        process.execPath,
        [jco, 'scaffold', join(scratch, 'reference'), '--wit', 'builtin:wasi-command@0.2.x', '--target', 'nodejs'],
        { cwd: root, stdio: 'inherit' },
    );
    await cp(join(scratch, 'reference', 'wit'), join(root, 'wit'), { recursive: true });
    execFileSync(
        process.execPath,
        [jco, 'guest-types', 'wit', '--world-name', 'wasi:cli/command@0.2.12', '-o', 'generated/types'],
        { cwd: root, stdio: 'inherit' },
    );
} finally {
    await rm(scratch, { recursive: true, force: true });
}
