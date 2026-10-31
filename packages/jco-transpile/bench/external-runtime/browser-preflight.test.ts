import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assert, test } from 'vitest';
import { fullScenarios } from './cases.js';
import { buildPair } from './build.js';
const exec = promisify(execFile);
// Serial fixture generation followed by browser correctness only; all graphs
// remain available for diagnosing a failure, independently of timed cohorts.
test('browser verifies the final payload and representative portfolio', async () => {
    const base = fileURLToPath(new URL('../output/external-runtime-browser-preflight/', import.meta.url));
    await mkdir(base, { recursive: true });
    const root = await mkdtemp(join(base, 'run-'));
    const selected = [
        'noise',
        'adder',
        'strings',
        'resource',
        'async',
        'portfolio',
        'stream-host-payload',
        'stream-payload',
        'stream-cancel',
        'futures',
        'future-pending',
        'future-rejected',
        'future-nested',
    ];
    const graphs = [];
    for (const id of selected) {
        const scenario = fullScenarios.find((s) => s.id === id)!;
        const built = await buildPair(scenario.components, 'rolldown', 'package', root);
        graphs.push({
            id: `rolldown--package--${id}`,
            bundler: 'rolldown',
            resolution: 'package',
            scenario: id,
            pair: { inline: built.inline, external: built.external },
        });
    }
    const manifest = join(root, 'manifest.json'),
        output = join(root, 'browser-verify.json');
    await writeFile(manifest, JSON.stringify({ checkpointKey: 'correctness-only', graphs }, null, 2) + '\n');
    try {
        const run = await exec(
            process.execPath,
            [fileURLToPath(new URL('./browser-collect.mjs', import.meta.url)), manifest, output, '--verify-only'],
            { timeout: 240_000, maxBuffer: 4 * 1024 * 1024 },
        );
        console.log(run.stdout);
    } catch (error) {
        console.error('Browser preflight retained at', root);
        throw error;
    }
    const observed = JSON.parse(await readFile(output, 'utf8'));
    assert.isTrue(observed.complete);
    assert.lengthOf(observed.sessions, 1);
    assert.lengthOf(observed.sessions[0].graphs, selected.length);
    for (const graph of observed.sessions[0].graphs) {
        assert.isTrue(graph.jspi);
    }
    console.log('Browser correctness artifacts:', root);
}, 300_000);
