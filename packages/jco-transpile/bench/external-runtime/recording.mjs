import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Baselines are checkpoint artifacts; an existing recording stays immutable. */
export async function publishBaseline(path, baseline) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' });
}
