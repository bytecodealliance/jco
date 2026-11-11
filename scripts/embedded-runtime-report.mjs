import { appendFile, readFile } from 'node:fs/promises';

// Dependency-free so the write-enabled reporter can run from the trusted base
// revision without installing dependencies or executing release-branch code.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MARKER = '<!-- js-component-bindgen-embedded-runtime -->';

/**
 * Describe a version reported by the check, which ran release-branch code.
 *
 * @param {unknown} value - version read from the check's result
 * @returns {string} the version, or a placeholder when it is not a valid one
 */
function version(value) {
    return typeof value === 'string' && VERSION.test(value) ? value : 'unknown';
}

/**
 * Build the release PR comment for a check result.
 *
 * @param {object} args
 * @param {{ stale?: unknown, embeddedVersion?: unknown, currentVersion?: unknown } | undefined} args.result -
 *   outcome of the check, or undefined when it did not complete
 * @param {string} args.sha - commit the check ran against
 * @param {string} args.runURL - link to the workflow run
 * @returns {{ body: string, current: boolean }} the comment, and whether the embedded runtime is current
 */
function buildReport({ result, sha, runURL }) {
    const current = result?.stale === false;
    let status;
    if (current) {
        status = 'The embedded runtime matches `packages/jco-cm-runtime`.';
    } else if (result?.stale === true) {
        status = [
            'The embedded runtime differs from `packages/jco-cm-runtime`, so this release would not ship the current runtime.',
            '',
            'If that is not intended, regenerate it with `pnpm --filter @bytecodealliance/jco-transpile build:embedded-runtime` and commit the result.',
        ].join('\n');
    } else {
        status = 'The check did not complete. Review the logs before releasing.';
    }
    const body = [
        MARKER,
        '### js-component-bindgen embedded runtime',
        '',
        `Commit: ${sha}`,
        '',
        '| Runtime | Version |',
        '| --- | --- |',
        `| Embedded in the crate | ${version(result?.embeddedVersion)} |`,
        `| \`packages/jco-cm-runtime\` | ${version(result?.currentVersion)} |`,
        '',
        status,
        '',
        `This is advisory and does not block merging. [View detailed results](${runURL}).`,
    ].join('\n');
    return { body, current };
}

/**
 * Summarize the check and keep one comment on the release PR up to date.
 * A comment is only created when the embedded runtime is not known to be current.
 *
 * @param {object} args
 * @param {any} args.event - the pull_request event payload
 * @param {NodeJS.ProcessEnv} args.env
 * @param {object | undefined} args.result - outcome of the check
 * @param {(method: string, path: string, body?: object) => Promise<any>} args.request - GitHub API call
 * @param {(body: string) => Promise<void>} args.summarize - writes the job summary
 */
async function report({ event, env, result, request, summarize }) {
    const pr = event.pull_request;
    const { body, current } = buildReport({
        result,
        sha: pr.head.sha,
        runURL: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    });
    await summarize(body);
    // Fork tokens are read-only: the summary remains available without a comment.
    if (pr.head.repo?.full_name !== env.GITHUB_REPOSITORY) {
        return;
    }
    const repoPath = `/repos/${env.GITHUB_REPOSITORY}`;
    const latest = await request('GET', `${repoPath}/pulls/${pr.number}`);
    // Do not let a slow, obsolete run replace results for a newer revision.
    if (latest.head.sha !== pr.head.sha || latest.state !== 'open') {
        return;
    }
    const commentsPath = `${repoPath}/issues/${pr.number}/comments`;
    let existing;
    for (let page = 1; ; page++) {
        const comments = await request('GET', `${commentsPath}?per_page=100&page=${page}`);
        existing = comments.find(
            (comment) => comment.user?.login === 'github-actions[bot]' && comment.body?.includes(MARKER),
        );
        if (existing || comments.length < 100) {
            break;
        }
    }
    if (existing) {
        await request('PATCH', `${repoPath}/issues/comments/${existing.id}`, { body });
    } else if (!current) {
        await request('POST', commentsPath, { body });
    }
}

/** Read the check result named by `RESULT_PATH` and report it on the release PR. */
async function main() {
    const env = process.env;
    let result;
    try {
        result = JSON.parse(await readFile(env.RESULT_PATH, 'utf8'));
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
        // A missing result is an incomplete check, never a current runtime.
    }
    await report({
        event: JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')),
        env,
        result,
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
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
