import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Dependency-free so the write-enabled reporter can run from the trusted base
// revision without installing dependencies or executing release-branch code.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NAME = /^[A-Za-z0-9_-]+$/;
// Explicit matrix targets, keyed by the project in prep-release-<project>-v<version>.
// The component crates ship together in jco's npm release. Test/helper binaries
// are not release projects and do not have a Rust library API to check.
const RELEASE_PROJECTS = {
    'js-component-bindgen': [{ package: 'js-component-bindgen', published: true }],
    'jco-node-fs': [{ package: 'jco-node-fs', published: false }],
    jco: [
        { package: 'js-component-bindgen-component', published: false },
        { package: 'wasm-tools-js', published: false },
    ],
};
const NO_BASELINE = 'No earlier stable release tag exists for this unpublished crate.';

export function parseReleaseBranch(branch = '') {
    const match = /^prep-release-([A-Za-z0-9_-]+)-v(.+)$/.exec(branch);
    return match && VERSION.test(match[2]) ? { project: match[1], version: match[2] } : null;
}

function versionParts(version) {
    return VERSION.exec(version).slice(1, 4).map(BigInt);
}

function compareVersions(left, right) {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return a[i] > b[i] ? 1 : -1;
        }
    }
    return 0;
}

export function selectRelease({ branch, tags = [] }) {
    const release = parseReleaseBranch(branch);
    const empty = { rust: false, matrix: { include: [] } };
    if (!release || !Object.hasOwn(RELEASE_PROJECTS, release.project)) {
        return empty;
    }
    const crates = RELEASE_PROJECTS[release.project];
    const prefix = `${release.project}-v`;
    const baseline = tags
        .filter((tag) => tag.startsWith(prefix))
        .map((tag) => ({ tag, version: tag.slice(prefix.length) }))
        .filter(
            ({ version }) =>
                /^\d+\.\d+\.\d+$/.test(version) &&
                VERSION.test(version) &&
                compareVersions(version, release.version) < 0,
        )
        .sort((a, b) => compareVersions(b.version, a.version))[0];

    const include = crates.map((crate) => {
        const entry = { package: crate.package, check: true, baselineRev: '', releaseType: '', reason: '' };
        if (crate.published) {
            return entry;
        }
        if (!baseline) {
            return { ...entry, check: false, reason: NO_BASELINE };
        }
        const [major, minor] = versionParts(release.version);
        const [oldMajor, oldMinor] = versionParts(baseline.version);
        // Wrapper Cargo versions may not track the enclosing npm project version.
        const releaseType =
            major > oldMajor || (major === 0n && minor > oldMinor) ? 'major' : minor > oldMinor ? 'minor' : 'patch';
        return { ...entry, baselineRev: baseline.tag, releaseType };
    });
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

export function buildReport({ plan, results, sha, runURL }) {
    const project = validateName(plan.project);
    const marker = `<!-- ${project}-semver-checks -->`;
    const rows = plan.matrix.include.map((crate) => {
        const name = validateName(crate.package);
        const result = results[name] ?? {};
        const all = outcome(result.allFeatures);
        const minimal = outcome(result.noDefaultFeatures);
        const checked = crate.check === true;
        let baseline = 'latest published crates.io release';
        if (crate.baselineRev) {
            if (
                !crate.baselineRev.startsWith(`${project}-v`) ||
                !VERSION.test(crate.baselineRev.slice(project.length + 2))
            ) {
                throw new Error('Invalid baseline tag');
            }
            baseline = crate.baselineRev;
        }
        if (!checked) {
            baseline = NO_BASELINE;
        }
        return {
            passed: checked && all === 'success' && minimal === 'success',
            text: `| ${name} | ${baseline} | ${checked ? all : 'not checked'} | ${checked ? minimal : 'not checked'} |`,
        };
    });
    const passed = rows.length > 0 && rows.every((row) => row.passed);
    const body = [
        marker,
        `### ${project} semver-checks`,
        '',
        `Commit: ${sha}`,
        '',
        '| Crate | Baseline | All features | No default features |',
        '| --- | --- | --- | --- |',
        ...rows.map((row) => row.text),
        '',
        passed
            ? 'All checks now pass.'
            : 'One or more checks did not pass or could not run. Review the logs for API incompatibilities, missing baselines, or checker/build errors before releasing.',
        '',
        'These checks cover public Rust APIs, not generated JavaScript, N-API, or WebAssembly interfaces.',
        '',
        `This is advisory and does not block merging. [View detailed results](${runURL}).`,
    ].join('\n');
    return { marker, body, passed };
}

export async function reportRelease({ event, env, plan, results, request, summarize }) {
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

async function main(command, env = process.env) {
    if (command === 'select') {
        const tags = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' }).trim().split('\n');
        const plan = selectRelease({ branch: env.RELEASE_BRANCH, tags });
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main(process.argv[2]).catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}
