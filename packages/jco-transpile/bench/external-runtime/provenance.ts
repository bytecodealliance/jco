import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fingerprint both runtime implementations, their trait contract, and callers. */
export async function sourceHashes(root: URL): Promise<Record<string, string>> {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.rs'));
    const hashes: Record<string, string> = {};
    for (const entry of files) {
        const path = join(entry.parentPath, entry.name);
        const key = relative(fileURLToPath(root), path).replaceAll('\\', '/');
        hashes[key] = createHash('sha256')
            .update(await readFile(path))
            .digest('hex');
    }
    return Object.fromEntries(
        Object.keys(hashes)
            .sort()
            .map((key) => [key, hashes[key]]),
    );
}
