/**
 * Summarize a V8 `.cpuprofile` by self time per function.
 *
 * usage: node profile-summary.mjs <file.cpuprofile> [rows]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const profile = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const rows = Number(process.argv[3] ?? 30);

const selfSamples = new Map();
for (const id of profile.samples) {
    selfSamples.set(id, (selfSamples.get(id) ?? 0) + 1);
}

const byFunction = new Map();
for (const node of profile.nodes) {
    const { functionName, url, lineNumber } = node.callFrame;
    const key = `${functionName || '(anonymous)'} ${basename(url)}:${lineNumber + 1}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + (selfSamples.get(node.id) ?? 0));
}

const total = profile.samples.length;
const sorted = [...byFunction].sort((left, right) => right[1] - left[1]).slice(0, rows);
for (const [key, samples] of sorted) {
    console.log(`${((samples / total) * 100).toFixed(1).padStart(5)}%  ${key}`);
}
