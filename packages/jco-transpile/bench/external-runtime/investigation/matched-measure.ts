import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MatchedGraph, MatchedMode } from './matched-build.js';
import { nodeWorker } from './node-worker.mjs';

export async function measureMatched(
    artifacts: MatchedGraph['artifacts'],
    verifyOnly = false,
    processIndex = 0,
    sampleCount = 15,
    memoryMode?: MatchedMode,
) {
    const suffix = memoryMode ?? (verifyOnly ? 'verify' : String(processIndex));
    const config = join(artifacts.inline.dir, `matched-config-${suffix}.json`);
    const output = join(artifacts.inline.dir, `matched-result-${suffix}.json`);
    await writeFile(config, JSON.stringify({ artifacts, output, verifyOnly, processIndex, sampleCount, memoryMode }), {
        flag: 'wx',
    });
    const { done } = nodeWorker([
        '--expose-gc',
        '--experimental-vm-modules',
        ...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : []),
        fileURLToPath(new URL('./matched-runner.mjs', import.meta.url)),
        config,
    ]);
    try {
        await done;
    } catch (error) {
        const failure = error as Error & { stdout?: string; stderr?: string };
        await writeFile(config + '.stderr.log', failure.stderr ?? '');
        await writeFile(config + '.stdout.log', failure.stdout ?? '');
        throw new Error(`Matched worker failed: ${config}\n${failure.stderr || failure.message}`);
    }
    return JSON.parse(await readFile(output, 'utf8'));
}
