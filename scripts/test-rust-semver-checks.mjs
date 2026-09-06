import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildReport, parseReleaseBranch, reportRelease, selectRelease } from './rust-semver-checks.mjs';

const select = (project, version = '2.8.2', tags = []) =>
    selectRelease({
        branch: `prep-release-${project}-v${version}`,
        tags,
    });

test('only valid release branches are selected', () => {
    for (const branch of ['ci/cargo-semver-checks', 'feature/prep-release-jco-v1.2.3', 'prep-release-jco-vnope']) {
        assert.equal(parseReleaseBranch(branch), null);
        assert.equal(selectRelease({ branch }).rust, false);
    }
    assert.deepEqual(parseReleaseBranch('prep-release-jco-node-fs-v0.2.0-rc.1'), {
        project: 'jco-node-fs',
        version: '0.2.0-rc.1',
    });
    assert.equal(select('preview2-shim').rust, false);
    assert.equal(select('unknown-project').rust, false);
    assert.equal(select('xtask').rust, false);
    assert.equal(select('constructor').rust, false);
});

test('published crates use registry baselines and automatic version-bump detection', () => {
    assert.deepEqual(select('js-component-bindgen').matrix.include, [
        {
            package: 'js-component-bindgen',
            check: true,
            baselineRev: '',
            releaseType: '',
            reason: '',
        },
    ]);
});

test('jco releases check both Rust component crates independently', () => {
    const plan = select('jco', '1.11.0', [
        'jco-v1.9.0',
        'jco-v1.10.0',
        'jco-v1.11.0',
        'jco-v1.11.0-rc.1',
        'other-v1.10.1',
    ]);
    assert.deepEqual(
        plan.matrix.include.map((c) => c.package),
        ['js-component-bindgen-component', 'wasm-tools-js'],
    );
    for (const entry of plan.matrix.include) {
        assert.equal(entry.check, true);
        assert.equal(entry.baselineRev, 'jco-v1.10.0');
        assert.equal(entry.releaseType, 'minor');
    }
});

test('unpublished crates use stable tags and the project release bump', () => {
    for (const [version, releaseType] of [
        ['0.1.1', 'patch'],
        ['0.2.0', 'major'],
        ['1.0.0', 'major'],
    ]) {
        const [entry] = select('jco-node-fs', version, ['jco-node-fs-v0.1.0', 'jco-node-fs-v0.2.0-rc.1']).matrix
            .include;
        assert.equal(entry.baselineRev, 'jco-node-fs-v0.1.0');
        assert.equal(entry.releaseType, releaseType);
    }
    assert.equal(select('jco', '2.0.0-rc.1', ['jco-v1.9.0', 'jco-v2.0.0']).matrix.include[0].baselineRev, 'jco-v1.9.0');
});

test('missing baselines are explicitly not checked', () => {
    for (const project of ['jco-node-fs', 'jco']) {
        const plan = select(project);
        assert.equal(plan.rust, true);
        assert.equal(plan.matrix.include[0].check, false);
        assert.ok(plan.matrix.include[0].reason);
        const report = buildReport({ plan, results: {}, sha: 'abc', runURL: 'https://example.com/run' });
        assert.equal(report.passed, false);
        assert.match(report.body, /not checked/);
        assert.doesNotMatch(report.body, /latest published crates.io release/);
    }
});

function fixture({
    passed = false,
    fork = false,
    existing = false,
    stale = false,
    closed = false,
    paginate = false,
} = {}) {
    const plan = select('js-component-bindgen');
    const env = { GITHUB_REPOSITORY: 'owner/jco', GITHUB_SERVER_URL: 'https://github.com', GITHUB_RUN_ID: '42' };
    const event = {
        pull_request: {
            number: 7,
            head: {
                ref: 'prep-release-js-component-bindgen-v2.8.2',
                sha: 'abc123',
                repo: { full_name: fork ? 'contributor/jco' : env.GITHUB_REPOSITORY },
            },
        },
    };
    const calls = [];
    const summaries = [];
    const result = { allFeatures: passed ? 'success' : 'failure', noDefaultFeatures: 'success' };
    return {
        calls,
        summaries,
        args: {
            event,
            env,
            plan,
            results: { 'js-component-bindgen': result },
            summarize: async (body) => {
                summaries.push(body);
            },
            request: async (method, path, body) => {
                calls.push({ method, path, body });
                if (path.endsWith('/pulls/7')) {
                    return { head: { sha: stale ? 'new-sha' : 'abc123' }, state: closed ? 'closed' : 'open' };
                }
                if (method === 'GET') {
                    // Do not edit a user's comment, even when it contains our marker.
                    const userComment = {
                        id: 1,
                        user: { login: 'human' },
                        body: '<!-- js-component-bindgen-semver-checks -->',
                    };
                    if (paginate && path.endsWith('page=1')) {
                        return Array.from({ length: 100 }, () => userComment);
                    }
                    return existing
                        ? [
                              {
                                  id: 99,
                                  user: { login: 'github-actions[bot]' },
                                  body: '<!-- js-component-bindgen-semver-checks -->',
                              },
                          ]
                        : [userComment];
                }
                return {};
            },
        },
    };
}

test('failed checks create an advisory comment and summary', async () => {
    const f = fixture();
    await reportRelease(f.args);
    const write = f.calls.find((call) => call.method === 'POST');
    assert.equal(write.path, '/repos/owner/jco/issues/7/comments');
    assert.match(write.body.body, /failure/);
    assert.match(write.body.body, /advisory/);
    assert.equal(f.summaries[0], write.body.body);
});

test('successful checks only post when updating an existing failure comment', async () => {
    for (const existing of [false, true]) {
        const f = fixture({ passed: true, existing });
        await reportRelease(f.args);
        const writes = f.calls.filter((call) => call.method !== 'GET');
        assert.equal(writes.length, existing ? 1 : 0);
        if (existing) {
            assert.equal(writes[0].method, 'PATCH');
            assert.equal(writes[0].path, '/repos/owner/jco/issues/comments/99');
            assert.match(writes[0].body.body, /All checks now pass/);
        }
    }
});

test('comments are paginated and updated rather than duplicated', async () => {
    const f = fixture({ existing: true, paginate: true });
    await reportRelease(f.args);
    assert.ok(f.calls.some((call) => call.path.endsWith('page=2')));
    assert.equal(f.calls.at(-1).method, 'PATCH');
});

test('fork PRs receive summaries without attempting authenticated API calls', async () => {
    const f = fixture({ fork: true });
    await reportRelease(f.args);
    assert.equal(f.summaries.length, 1);
    assert.equal(f.calls.length, 0);
});

test('obsolete runs and closed PRs do not update comments', async () => {
    for (const options of [{ stale: true }, { closed: true }]) {
        const f = fixture(options);
        await reportRelease(f.args);
        assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0].method, 'GET');
    }
});

test('missing matrix results are incomplete, not success', () => {
    const plan = select('jco', '1.11.0', ['jco-v1.10.0']);
    const report = buildReport({
        plan,
        results: {
            'js-component-bindgen-component': { allFeatures: 'success', noDefaultFeatures: 'success' },
        },
        sha: 'abc',
        runURL: 'https://example.com/run',
    });
    assert.equal(report.passed, false);
    assert.match(report.body, /wasm-tools-js.*not completed/);
});

test('invalid outcome strings cannot inject comment content', () => {
    const f = fixture();
    f.args.results['js-component-bindgen'].allFeatures = 'unexpected @mention';
    const report = buildReport({ ...f.args, sha: 'abc', runURL: 'https://example.com/run' });
    assert.equal(report.passed, false);
    assert.doesNotMatch(report.body, /@mention/);
});

test('untrusted plans cannot change the release project or use path-like crate names', async () => {
    const f = fixture();
    f.args.plan.project = 'other-project';
    await assert.rejects(reportRelease(f.args), /does not match/);
    assert.equal(f.summaries.length, 0);
    const plan = select('js-component-bindgen');
    plan.matrix.include[0].package = '../other-file';
    assert.throws(() => buildReport({ plan, results: {} }), /Invalid project or crate name/);
});

test('API permission errors still leave the job summary', async () => {
    const f = fixture();
    f.args.request = async () => {
        throw new Error('HTTP 403');
    };
    await assert.rejects(reportRelease(f.args), /HTTP 403/);
    assert.equal(f.summaries.length, 1);
});

test('CLI records matrix artifacts and reports them, including missing artifacts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rust-semver-checks-'));
    try {
        const f = fixture({ fork: true });
        const env = {
            ...process.env,
            ...f.args.env,
            GITHUB_TOKEN: '',
            RESULTS_DIR: join(directory, 'results'),
            GITHUB_EVENT_PATH: join(directory, 'event.json'),
            GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
            SEMVER_PLAN: JSON.stringify(f.args.plan),
            CRATE: 'js-component-bindgen',
            ALL_FEATURES: 'failure',
            NO_DEFAULT_FEATURES: 'success',
        };
        const script = fileURLToPath(new URL('./rust-semver-checks.mjs', import.meta.url));
        await writeFile(env.GITHUB_EVENT_PATH, JSON.stringify(f.args.event));
        execFileSync(process.execPath, [script, 'record'], { env });
        assert.deepEqual(JSON.parse(await readFile(join(env.RESULTS_DIR, `${env.CRATE}.json`), 'utf8')), {
            allFeatures: 'failure',
            noDefaultFeatures: 'success',
        });
        execFileSync(process.execPath, [script, 'report'], { env });
        assert.match(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8'), /failure.*success/);

        env.RESULTS_DIR = join(directory, 'missing');
        env.GITHUB_STEP_SUMMARY = join(directory, 'missing-summary.md');
        execFileSync(process.execPath, [script, 'report'], { env });
        assert.match(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8'), /not completed/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('workflow never uses pull_request_target or inline github-script', async () => {
    const workflow = await readFile(new URL('../.github/workflows/rust-api-compat.yml', import.meta.url), 'utf8');
    assert.doesNotMatch(workflow, /^\s*pull_request_target\s*:/m);
    assert.doesNotMatch(workflow, /uses:\s*actions\/github-script@/);
    assert.match(workflow, /ref: \$\{\{ github.event.pull_request.base.sha \}\}/);
});
