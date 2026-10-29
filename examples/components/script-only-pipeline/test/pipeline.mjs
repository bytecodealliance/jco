import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createPipeline } from '../demo/shared/pipeline.js';
import { readScript } from '../demo/shared/read-script.js';

const pipeline = await createPipeline(readFile);
const input = await readFile(new URL('../demo/access-logs.json', import.meta.url), 'utf8');
const scripts = {};
const stages = [];
for (const name of ['geoip', 'risk-score', 'top-pages']) {
    const script = await readScript(await component(name));
    scripts[name] = script;
    stages.push({ script, options: JSON.parse(pipeline.describe(script).defaultOptions) });
}

function component(name) {
    return readFile(new URL(`../dist/components/${name}.wasm`, import.meta.url));
}

test('an empty pipeline returns the original logs', () => {
    assert.deepEqual(pipeline.run(input, []), { logs: JSON.parse(input), reports: {}, steps: [] });
});

test('three separately packaged scripts share annotations and reports in one engine', () => {
    const result = pipeline.run(input, stages);
    assert.equal(result.steps.length, 3);
    assert.equal(result.logs.length, 5);
    assert(result.logs.every((log) => log.country === 'DE'));
    assert.deepEqual(
        result.logs.map((log) => log.riskScore),
        [0, 70, 70, 0, 90],
    );
    assert.deepEqual(result.reports.topPages, [
        { path: '/docs', visits: 2 },
        { path: '/login', visits: 2 },
        { path: '/admin', visits: 1 },
    ]);
    // The first step's snapshot predates scoring; snapshots are independent copies.
    assert(result.steps[0].logs.every((log) => log.riskScore === undefined));
    assert.deepEqual(pipeline.run(input, stages), result);
});

test('options and order change the results', () => {
    const risky = pipeline.run(input, [
        stages[0],
        { script: scripts['risk-score'], options: { minScore: 70 } },
        stages[2],
    ]);
    assert.equal(risky.logs.length, 3);
    assert.deepEqual(risky.reports.topPages, [
        { path: '/login', visits: 2 },
        { path: '/admin', visits: 1 },
    ]);
    const countFirst = pipeline.run(input, [stages[2], stages[0]]);
    assert.equal(countFirst.logs.length, 5);
    assert.equal(countFirst.reports.topPages[0].visits, 4);
    assert.equal(
        countFirst.reports.topPages.reduce((sum, page) => sum + page.visits, 0),
        12,
    );
});

test('empty datasets and a new run cannot inherit previous annotations or reports', () => {
    pipeline.run(input, stages);
    assert.deepEqual(pipeline.run('[]', stages).reports, { topPages: [] });
    assert.deepEqual(pipeline.run(input, []), { logs: JSON.parse(input), reports: {}, steps: [] });
});

test('invalid input and options produce recoverable component errors', () => {
    for (const invalid of ['{', '{}', '[{}]', '[{"status":999}]']) {
        assert.throws(() => pipeline.run(invalid, stages));
    }
    for (const [name, options] of [
        ['geoip', { country: 'XX' }],
        ['geoip', { country: ['DE'] }],
        ['risk-score', { minScore: -1 }],
        ['top-pages', { limit: 0 }],
        ['top-pages', []],
    ]) {
        assert.throws(() => pipeline.run(input, [{ script: scripts[name], options }]));
    }
    assert.equal(pipeline.run(input, stages).logs.length, 5);
});

test('uploads must be processor script-only components', async () => {
    await assert.rejects(readScript(new TextEncoder().encode('not wasm')));
    await assert.rejects(readScript(await component('engine')), /script-only component/);
    const dataset = await readScript(await component('dataset'));
    assert.throws(() => pipeline.describe(dataset), /processor export/);
    assert.throws(() => pipeline.describe({ ...scripts.geoip, engineWorld: 'wrong:world/world' }), /processor export/);
});

test('different engine instances have separate datasets', async () => {
    const other = await createPipeline(readFile);
    assert.equal(other.run('[]', stages).logs.length, 0);
    assert.equal(pipeline.run(input, stages).logs.length, 5);
    assert.equal(other.run(input, []).logs.length, 12);
});

const exec = promisify(execFile);
const demoUrl = new URL('../demo/node.mjs', import.meta.url);
const demoEnv = { ...process.env };
delete demoEnv.PIPELINE_STAGES;

async function runDemo(args = [], env = {}) {
    const { stdout } = await exec(process.execPath, [fileURLToPath(demoUrl), ...args], {
        env: { ...demoEnv, ...env },
    });
    return {
        summaries: stdout.slice(0, stdout.indexOf('{')).trim(),
        result: JSON.parse(stdout.slice(stdout.indexOf('{'))),
    };
}

test('the Node CLI selects stages from arguments or ENV, with arguments taking precedence', async () => {
    const ordered = await runDemo(['top-pages', 'geoip']);
    assert.match(ordered.summaries, /^Pages:.*\nGeoIP:/);
    assert.equal(ordered.result.logs.length, 5);
    assert.equal(ordered.result.reports.topPages[0].visits, 4);

    const fromEnv = await runDemo([], { PIPELINE_STAGES: 'geoip, top-pages' });
    assert.equal(fromEnv.result.logs.length, 5);
    assert.equal(fromEnv.result.reports.topPages[0].visits, 2);

    const overridden = await runDemo(['risk-score'], { PIPELINE_STAGES: 'geoip' });
    assert.equal(overridden.result.logs.length, 12);
    assert(overridden.result.logs.every((log) => typeof log.riskScore === 'number' && log.country === undefined));

    const empty = await runDemo([], { PIPELINE_STAGES: '' });
    assert.equal(empty.summaries, '');
    assert.deepEqual(empty.result, { logs: JSON.parse(input), reports: {} });
});

test('the Node CLI reports unknown stages and exits unsuccessfully', async () => {
    await assert.rejects(runDemo(['missing']), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Unknown stage "missing"\. Available stages:/);
        return true;
    });
});

test('importing the Node entry point does not run the demo', async () => {
    const { stdout, stderr } = await exec(process.execPath, [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(demoUrl.href)})`,
    ]);
    assert.equal(stdout, '');
    assert.equal(stderr, '');
});
