// Final matched browser assessment, independent of the Node timing cohort.
// No source transformation or optimization candidate is applied to either bundle.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer';
const root = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(process.argv[2] ?? ''),
    output = path.resolve(process.argv[3] ?? '');
assert(process.argv[2] && process.argv[3], 'manifest and new output path required');
await assert.rejects(fs.access(output), (error) => error.code === 'ENOENT');
const verifyOnly = process.argv[4] === '--verify-only';
assert(
    process.argv.length === 4 || (process.argv.length === 5 && verifyOnly),
    'unexpected browser collector arguments',
);
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const scenarios = [
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
const graphs = scenarios.map((id) => {
    const graph = manifest.graphs.find(
        (g) => g.bundler === 'rolldown' && g.resolution === 'package' && g.scenario === id,
    );
    assert(graph, id);
    assert.deepEqual(graph.pair.inline.wasm, graph.pair.external.wasm);
    return graph;
});
const pinnedBundles = {};
for (const graph of graphs) {
    for (const mode of ['inline', 'external']) {
        const artifact = graph.pair[mode],
            bytes = await fs.readFile(artifact.bundle);
        assert.equal(bytes.byteLength, artifact.js.raw, 'bundle size differs from manifest');
        pinnedBundles[artifact.bundle] = createHash('sha256').update(bytes).digest('hex');
        for (const [name, digest] of Object.entries(artifact.wasm.files)) {
            assert.equal(
                createHash('sha256')
                    .update(await fs.readFile(path.join(artifact.dir, name)))
                    .digest('hex'),
                digest,
                'core Wasm differs from manifest',
            );
        }
    }
}
const source = await fs.readFile(path.join(here, 'workloads.mjs'), 'utf8');
const shim = path.resolve(here, '../../node_modules/@bytecodealliance/preview2-shim');
const shimInputs = {};
for (const name of (await fs.readdir(path.join(shim, 'dist'), { recursive: true }))
    .filter((name) => name.endsWith('.js'))
    .sort()) {
    const digest = createHash('sha256')
        .update(await fs.readFile(path.join(shim, 'dist', name)))
        .digest('hex');
    shimInputs[name] = digest;
    if (manifest.environment?.shimArtifacts) {
        assert.equal(
            digest,
            manifest.environment.shimArtifacts[name],
            'browser shim differs from Node checkpoint: ' + name,
        );
    }
}
const browserSources = {};
for (const name of ['workloads.mjs', 'browser-check.mjs', 'browser-probe.mjs', 'browser-collect.mjs']) {
    browserSources[name] = createHash('sha256')
        .update(await fs.readFile(path.join(here, name)))
        .digest('hex');
}
const toUrl = (p) => '/workspace/' + path.relative(root, p).split(path.sep).join('/');
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        let bytes,
            type = 'text/javascript';
        if (url.pathname === '/') {
            type = 'text/html';
            bytes = `<!doctype html><script type="importmap">${JSON.stringify({ imports: { '@bytecodealliance/preview2-shim': toUrl(path.join(shim, 'dist/browser/index.js')), '@bytecodealliance/preview2-shim/instantiation': toUrl(path.join(shim, 'dist/common/instantiation.js')) } })}</script>`;
        } else if (url.pathname.endsWith('/__browser-workloads.mjs')) {
            bytes = source.replace("'node:assert/strict'", "'./browser-check.mjs'");
        } else {
            assert(url.pathname.startsWith('/workspace/'));
            const file = path.resolve(root, decodeURIComponent(url.pathname.slice('/workspace/'.length)));
            assert(file.startsWith(root + path.sep));
            bytes = await fs.readFile(file);
            if (file.endsWith('.wasm')) {
                type = 'application/wasm';
            }
        }
        res.writeHead(200, {
            'Content-Type': type,
            'Cache-Control': 'no-store',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        });
        res.end(bytes);
    } catch (error) {
        res.writeHead(500);
        res.end(String(error));
    }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const result = {
    schema: 1,
    scope: verifyOnly ? 'correctness preflight; no timing assessment' : 'three-session final browser assessment',
    complete: false,
    manifest: manifestPath,
    checkpointKey: manifest.checkpointKey,
    inputBundles: pinnedBundles,
    shimInputs,
    browserSources,
    protocol: {
        sessions: verifyOnly ? 1 : 3,
        samples: verifyOnly ? 0 : 15,
        scenarios,
        seed: 'trait-runtime-browser',
        size: 'Node bundle sizes; browser reuses exact bundles',
        freshContext: 'one new context per scenario per independent browser session',
        ordering: 'rotated scenarios and alternating paired mode order',
        parse: 'No isolated parse axis is claimed',
    },
    sessions: [],
};
await fs.mkdir(path.dirname(output), { recursive: true });
try {
    for (let sessionIndex = 0; sessionIndex < (verifyOnly ? 1 : 3); sessionIndex++) {
        const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_PATH });
        const session = { index: sessionIndex, version: await browser.version(), graphs: [] };
        result.sessions.push(session);
        try {
            const rotated = graphs.slice(sessionIndex * 3).concat(graphs.slice(0, sessionIndex * 3));
            for (const [scenarioIndex, graph] of rotated.entries()) {
                for (const mode of ['inline', 'external']) {
                    assert.deepEqual(graph.pair[mode].builtins, [], `${graph.id} cannot retain Node imports`);
                    const bytes = await fs.readFile(graph.pair[mode].bundle);
                    assert.equal(
                        createHash('sha256').update(bytes).digest('hex'),
                        pinnedBundles[graph.pair[mode].bundle],
                    );
                }
                const context = await browser.createBrowserContext();
                try {
                    const page = await context.newPage();
                    await page.goto(base);
                    const pair = Object.fromEntries(
                        ['inline', 'external'].map((mode) => [
                            mode,
                            {
                                ...graph.pair[mode],
                                dir: base + toUrl(graph.pair[mode].dir),
                                bundle: base + toUrl(graph.pair[mode].bundle),
                            },
                        ]),
                    );
                    const observed = await page.evaluate(
                        async ({ url, config }) => {
                            const { probe } = await import(url);
                            return probe(config);
                        },
                        {
                            url: base + toUrl(path.join(here, 'browser-probe.mjs')),
                            config: { pair, samples: 15, sessionIndex, scenarioIndex, verifyOnly },
                        },
                    );
                    assert.deepEqual(observed.verified, graph.pair.inline.parts);
                    session.graphs.push({ id: graph.id, ...observed });
                    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
                    console.log(`browser session ${sessionIndex + 1}/${verifyOnly ? 1 : 3}: ${graph.scenario}`);
                } finally {
                    await context.close();
                }
            }
        } finally {
            await browser.close();
        }
    }
    result.complete = true;
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
} finally {
    await new Promise((resolve) => server.close(resolve));
}
