import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Run in a temporary directory that resolves this checkout's Preview 3 shim. */
export async function withWorkspacePreview3Shim(run) {
    const directory = await mkdtemp(join(tmpdir(), 'jco-preview3-shim-'));
    try {
        const modules = join(directory, 'node_modules/@bytecodealliance');
        await mkdir(modules, { recursive: true });
        await symlink(
            fileURLToPath(new URL('../../packages/preview3-shim', import.meta.url)),
            join(modules, 'preview3-shim'),
            'dir',
        );
        return await run(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
