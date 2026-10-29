import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import config from '../demo/vite.config.js';
import { createPipeline } from '../demo/shared/pipeline.js';
import { readScript } from '../demo/shared/read-script.js';

const component = (name) => fileURLToPath(new URL(`../dist/components/${name}.wasm`, import.meta.url));
const input = await readFile(new URL('../demo/access-logs.json', import.meta.url), 'utf8');
const nodePipeline = await createPipeline(readFile);
const nodeStages = [];
for (const name of ['geoip', 'risk-score', 'top-pages']) {
    const script = await readScript(await readFile(component(name)));
    nodeStages.push({ script, options: JSON.parse(nodePipeline.describe(script).defaultOptions) });
}
const expected = nodePipeline.run(input, nodeStages);
const server = await createServer({
    ...config,
    configFile: false,
    logLevel: 'silent',
    server: { ...config.server, host: '127.0.0.1', port: 0, open: false },
});
let browser;
const diagnostics = [];
const downloads = await mkdtemp(join(tmpdir(), 'jco-pipeline-download-'));
try {
    await server.listen();
    browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_PATH || undefined,
        args: (process.env.TEST_PUPPETEER_LAUNCH_ARGS ?? '').split(/[\s,]+/).filter(Boolean),
    });
    const page = await browser.newPage();
    page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error') {
            diagnostics.push(`console: ${message.text()}`);
        }
    });
    page.on('requestfailed', (request) => diagnostics.push(`requestfailed: ${request.url()}`));
    page.on('response', (response) => {
        if (response.status() >= 400) {
            diagnostics.push(`HTTP ${response.status()}: ${response.url()}`);
        }
    });
    const response = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/demo/`);
    assert(response.ok());
    await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('#status').dataset.state), {
        timeout: 60_000,
    });
    assert.equal(
        await page.$eval('#status', (el) => el.dataset.state),
        'ready',
        await page.$eval('#status', (el) => el.textContent),
    );
    assert.equal((await page.$$('#pipeline > li')).length, 0);
    assert.equal(await page.$eval('#empty', (el) => el.hidden), false);
    await page.click('#run');
    assert.deepEqual(await output(page), { logs: JSON.parse(input), reports: {} });

    // Download links serve actual component binaries, ready to upload again.
    for (const name of ['geoip', 'risk-score', 'top-pages']) {
        const bytes = await page.evaluate(
            async (name) => [...new Uint8Array(await (await fetch(`../dist/components/${name}.wasm`)).arrayBuffer())],
            name,
        );
        assert.deepEqual(new Uint8Array(bytes), new Uint8Array(await readFile(component(name))));
    }

    await upload(page, component('dataset'));
    assert.match(await page.$eval('#status', (el) => el.textContent), /processor export/);
    assert.equal((await page.$$('#pipeline > li')).length, 0);

    await upload(page, ...['geoip', 'risk-score', 'top-pages'].map(component));
    assert.equal((await page.$$('#pipeline > li')).length, 3);
    await page.click('#run');
    assert.deepEqual(await output(page), { logs: expected.logs, reports: expected.reports });
    assert.equal((await page.$$('#steps > li')).length, 3);

    await setValue(page, '#pipeline > li:nth-child(2) textarea', '{"minScore":70}');
    await page.click('#run');
    assert.equal((await output(page)).logs.length, 3);
    await page.click('button[aria-label="Move up: Most visited pages"]');
    await page.click('button[aria-label="Move up: Most visited pages"]');
    await page.click('#run');
    assert.equal((await output(page)).reports.topPages[0].visits, 4);
    await page.click('button[aria-label="Remove: Risk score"]');
    await page.click('#run');
    assert.equal((await output(page)).logs.length, 5);

    await upload(page, fileURLToPath(new URL('../demo/access-logs.json', import.meta.url)));
    assert.equal(await page.$eval('#status', (el) => el.dataset.state), 'error');
    assert.equal((await page.$$('#pipeline > li')).length, 2);
    await setValue(page, '#pipeline > li:first-child textarea', '{"limit":0}');
    await page.click('#run');
    assert.equal(await page.$eval('#status', (el) => el.dataset.state), 'error');
    assert.deepEqual(await output(page), {});
    await setValue(page, '#pipeline > li:first-child textarea', '{"limit":5}');
    await page.click('#run');
    assert.equal((await output(page)).logs.length, 5);

    await page.click('#clear');
    await setValue(page, '#input', '{broken');
    await page.click('#run');
    assert.equal(await page.$eval('#status', (el) => el.dataset.state), 'error');
    await page.click('#restore');
    await page.click('#run');
    assert.deepEqual(await output(page), { logs: JSON.parse(input), reports: {} });
    assert.equal((await page.$$('#pipeline > li')).length, 0);
    await page.waitForFunction(() => document.querySelector('#source-editor').dataset.ready === 'true', {
        timeout: 60_000,
    });
    assert(
        (await page.$$('#source-editor .cm-content span')).length > 0,
        'CodeMirror should highlight the TypeScript source',
    );

    await createComponent(page);
    assert.equal((await page.$$('#pipeline > li')).length, 1);
    await page.click('#run');
    assert.equal((await output(page)).logs.length, 4);

    // Edit the actual highlighted editor, including a TypeScript type annotation.
    const customSource = (await readFile(new URL('../demo/custom-template.ts', import.meta.url), 'utf8')).replace(
        'minStatus: 400',
        'minStatus: 500',
    );
    await editSource(page, customSource);
    await createComponent(page);
    assert.equal((await page.$$('#pipeline > li')).length, 2);
    await page.click('#run');
    assert.equal((await output(page)).logs.length, 1);

    // The downloadable bytes are a real script component, reusable by either host.
    assert.equal(await page.$eval('#download-custom', (el) => el.download), 'http-status.wasm');
    const bytes = new Uint8Array(
        await page.$eval('#download-custom', async (el) => [
            ...new Uint8Array(await (await fetch(el.href)).arrayBuffer()),
        ]),
    );
    const customScript = await readScript(bytes);
    const description = nodePipeline.describe(customScript);
    const fromNode = nodePipeline.run(input, [
        { script: customScript, options: JSON.parse(description.defaultOptions) },
    ]);
    assert.deepEqual(await output(page), { logs: fromNode.logs, reports: fromNode.reports });
    const downloaded = join(downloads, 'http-status.wasm');
    await writeFile(downloaded, bytes);
    await page.click('#clear');
    await upload(page, downloaded);
    await page.click('#run');
    assert.equal((await output(page)).logs.length, 1);

    await editSource(page, 'export const processor = {');
    await createComponent(page, 'error');
    assert.equal((await page.$$('#pipeline > li')).length, 1);
    assert.equal(await page.$eval('#download-custom', (el) => el.hidden), true);
    await page.click('#reset-source');
    await createComponent(page);
    await page.click('#run');
    assert.equal((await output(page)).logs.length, 1);

    assert.equal(diagnostics.filter((entry) => entry.startsWith('pageerror:')).length, 0, diagnostics.join('\n'));
    console.log('Browser uploads, custom TypeScript builds, download round trips, recovery, and Node.js parity passed');
} catch (error) {
    console.error(diagnostics.join('\n'));
    throw error;
} finally {
    await browser?.close();
    await server.close();
    await rm(downloads, { recursive: true, force: true });
}

async function upload(page, ...paths) {
    await (await page.$('#components')).uploadFile(...paths);
    await page.waitForFunction(() => !document.querySelector('#components').disabled);
}

async function setValue(page, selector, value) {
    await page.$eval(
        selector,
        (element, value) => {
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        },
        value,
    );
}

async function output(page) {
    return JSON.parse(await page.$eval('#output', (element) => element.textContent));
}

async function createComponent(page, expectedState = 'ready') {
    await page.click('#create-component');
    await page.waitForFunction(() => !document.querySelector('#create-component').disabled, { timeout: 120_000 });
    assert.equal(
        await page.$eval('#build-status', (el) => el.dataset.state),
        expectedState,
        await page.$eval('#build-status', (el) => el.textContent),
    );
}

async function editSource(page, source) {
    await page.click('#source-editor .cm-content');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.insertText(source);
    await page.waitForFunction((source) => document.querySelector('#source').value === source, {}, source);
}
