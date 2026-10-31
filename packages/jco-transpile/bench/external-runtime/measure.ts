import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Artifact } from './build.js';
import type { Values } from './report.js';

const exec = promisify(execFile);
export interface Measurement {
    medians: Values;
    verified: string[];
    pairedRatios: Record<string, number>;
    [key: string]: unknown;
}
type MeasureArtifact = Pick<Artifact, 'dir' | 'bundle' | 'parts' | 'wasm'>;
export async function measure(
    pair: { inline: MeasureArtifact; external: MeasureArtifact },
    verifyOnly = false,
    processIndex = 0,
    sampleCount = 15,
    memoryMode?: 'inline' | 'external',
): Promise<Measurement> {
    const suffix = memoryMode ?? (verifyOnly ? 'verify' : String(processIndex));
    const config = join(pair.inline.dir, `benchmark-${suffix}.json`);
    const output = join(pair.inline.dir, `measurements-${suffix}.json`);
    await writeFile(
        config,
        JSON.stringify({
            inline: pair.inline,
            external: pair.external,
            output,
            verifyOnly,
            processIndex,
            sampleCount,
            memoryMode,
        }),
    );
    await exec(
        process.execPath,
        [
            '--expose-gc',
            '--experimental-vm-modules',
            ...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : []),
            fileURLToPath(new URL('./runner.mjs', import.meta.url)),
            config,
        ],
        { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return JSON.parse(await readFile(output, 'utf8'));
}
