import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Dependency-free so the write-enabled reporter can run from the trusted base
// revision without installing dependencies or executing release-branch code.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NAME = /^[A-Za-z0-9_-]+$/;
// Explicit matrix targets, keyed by the project in prep-release-<project>-v<version>.
// Only crates published to crates.io need public Rust API compatibility checks.
const RELEASE_PROJECTS = {
    'js-component-bindgen': ['js-component-bindgen'],
};

function parseReleaseBranch(branch = '') {
    const match = /^prep-release-([A-Za-z0-9_-]+)-v(.+)$/.exec(branch);
    return match && VERSION.test(match[2]) ? { project: match[1], version: match[2] } : null;
}

function selectRelease({ branch }) {
    const release = parseReleaseBranch(branch);
    const empty = { rust: false, matrix: { include: [] } };
    if (!release || !Object.hasOwn(RELEASE_PROJECTS, release.project)) {
        return empty;
    }
    const include = RELEASE_PROJECTS[release.project].map((name) => ({ package: name }));
    return { ...release, rust: include.length > 0, matrix: { include } };
}

function outcome(value) {
    return ['success', 'failure', 'cancelled', 'skipped'].includes(value) ? value : 'not completed';
}

function validateName(value) {
    if (typeof value !== 'string' || !NAME.test(value)) {
        throw new Error('Invalid project or crate name');
    }
    return value;
}

function buildReport({ plan, results, sha, runURL }) {
    const project = validateName(plan.project);
    const marker = `<!-- ${project}-semver-checks -->`;
    const rows = plan.matrix.include.map((crate) => {
        const name = validateName(crate.package);
        const result = results[name] ?? {};
        const all = outcome(result.allFeatures);
        const minimal = outcome(result.noDefaultFeatures);
        return {
            passed: all === 'success' && minimal === 'success',
            text: `| ${name} | ${all} | ${minimal} |`,
        };
    });
    const passed = rows.length > 0 && rows.every((row) => row.passed);
    const body = [
        marker,
        `### ${project} semver-checks`,
        '',
        `Commit: ${sha}`,
        '',
        'Baseline: latest published crates.io release.',
        '',
        '| Crate | All features | No default features |',
        '| --- | --- | --- |',
        ...rows.map((row) => row.text),
        '',
        passed
            ? 'All checks now pass.'
            : 'One or more checks did not pass or could not run. Review the logs for API incompatibilities or checker/build errors before releasing.',
        '',
        'These checks cover public Rust APIs, not generated JavaScript, N-API, or WebAssembly interfaces.',
        '',
        `This is advisory and does not block merging. [View detailed results](${runURL}).`,
    ].join('\n');
    return { marker, body, passed };
}

async function reportRelease({ event, env, plan, results, request, summarize }) {
    if (!plan.rust) {
        return;
    }
    const pr = event.pull_request;
    const release = parseReleaseBranch(pr.head.ref);
    if (!release || release.project !== plan.project || release.version !== plan.version) {
        throw new Error('Release plan does not match the pull request');
    }
    const report = buildReport({
        plan,
        results,
        sha: pr.head.sha,
        runURL: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    });
    await summarize(report.body);
    // Fork tokens are read-only: the summary remains available without a comment.
    if (pr.head.repo?.full_name !== env.GITHUB_REPOSITORY) {
        return;
    }
    const repoPath = `/repos/${env.GITHUB_REPOSITORY}`;
    const current = await request('GET', `${repoPath}/pulls/${pr.number}`);
    // Do not let a slow, obsolete run replace results for a newer revision.
    if (current.head.sha !== pr.head.sha || current.state !== 'open') {
        return;
    }
    const commentsPath = `${repoPath}/issues/${pr.number}/comments`;
    let existing;
    for (let page = 1; ; page++) {
        const comments = await request('GET', `${commentsPath}?per_page=100&page=${page}`);
        existing = comments.find(
            (comment) => comment.user?.login === 'github-actions[bot]' && comment.body?.includes(report.marker),
        );
        if (existing || comments.length < 100) {
            break;
        }
    }
    if (existing) {
        await request('PATCH', `${repoPath}/issues/comments/${existing.id}`, { body: report.body });
    } else if (!report.passed) {
        await request('POST', commentsPath, { body: report.body });
    }
}

async function main() {
    const [command] = process.argv.slice(2);
    const env = process.env;
    if (command === 'select') {
        const plan = selectRelease({ branch: env.RELEASE_BRANCH });
        console.log(JSON.stringify(plan));
        if (env.GITHUB_OUTPUT) {
            await appendFile(env.GITHUB_OUTPUT, `plan=${JSON.stringify(plan)}\n`);
        }
    } else if (command === 'record') {
        const crate = validateName(env.CRATE);
        await mkdir(env.RESULTS_DIR, { recursive: true });
        await writeFile(
            join(env.RESULTS_DIR, `${crate}.json`),
            JSON.stringify({
                allFeatures: outcome(env.ALL_FEATURES),
                noDefaultFeatures: outcome(env.NO_DEFAULT_FEATURES),
            }),
        );
    } else if (command === 'report') {
        const plan = JSON.parse(env.SEMVER_PLAN);
        const results = Object.create(null);
        for (const crate of plan.matrix.include) {
            const name = validateName(crate.package);
            try {
                results[name] = JSON.parse(await readFile(join(env.RESULTS_DIR, `${name}.json`), 'utf8'));
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    throw err;
                }
                // Missing artifacts are incomplete checks, never a clean pass.
            }
        }
        await reportRelease({
            event: JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')),
            env,
            plan,
            results,
            summarize: (body) => appendFile(env.GITHUB_STEP_SUMMARY, `${body}\n`),
            request: async (method, path, body) => {
                if (!env.GITHUB_TOKEN) {
                    throw new Error('GITHUB_TOKEN is required to post release results');
                }
                const response = await fetch(`${env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
                    method,
                    headers: {
                        authorization: `Bearer ${env.GITHUB_TOKEN}`,
                        accept: 'application/vnd.github+json',
                        'content-type': 'application/json',
                    },
                    body: body ? JSON.stringify(body) : undefined,
                    signal: AbortSignal.timeout(30_000),
                });
                if (!response.ok) {
                    throw new Error(`GitHub ${method} request failed: HTTP ${response.status}`);
                }
                return response.json();
            },
        });
    } else {
        throw new Error('Usage: node scripts/rust-semver-checks.mjs <select|record|report>');
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
