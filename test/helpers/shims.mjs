import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Run in a temporary directory resolving the given Preview 3 shim package. */
async function withPreview3ShimPackage(shimRoot, run) {
    const directory = await mkdtemp(join(tmpdir(), 'jco-preview3-shim-'));
    try {
        const modules = join(directory, 'node_modules/@bytecodealliance');
        await mkdir(modules, { recursive: true });
        await symlink(shimRoot, join(modules, 'preview3-shim'), 'dir');
        return await run(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

/** Run in a temporary directory that resolves this checkout's Preview 3 shim. */
export async function withWorkspacePreview3Shim(run) {
    return withPreview3ShimPackage(fileURLToPath(new URL('../../packages/preview3-shim', import.meta.url)), run);
}

/** Run in a temporary directory resolving the Preview 3 shim installed for jco-transpile. */
export async function withInstalledPreview3Shim(run) {
    const resolveFromTranspile = createRequire(new URL('../../packages/jco-transpile/package.json', import.meta.url));
    const shimRoot = fileURLToPath(
        new URL('../../', pathToFileURL(resolveFromTranspile.resolve('@bytecodealliance/preview3-shim/cli'))),
    );
    return withPreview3ShimPackage(shimRoot, run);
}
