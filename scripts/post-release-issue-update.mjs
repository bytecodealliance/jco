import { URL } from 'node:url';
import { env } from 'node:process';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { getOctokit } from '@actions/github';

import { runGitCliff } from 'git-cliff';

const COMMENT_INDICATOR = '<!-- post-release-issue-update -->';

/**
 * This script updates issues that are mentioned in the latest release
 * and makes sure that they reference the release in which the issue went out.
 *
 * Using this script requires that git-cliff is installed, for retrieving
 * the current commita associated with the current release.
 */
async function main() {
    const ghToken = env.GITHUB_TOKEN;
    if (!ghToken) {
        throw new Error('GITHUB_TOKEN not set');
    }
    console.error(`using GH token [${'x'.repeat(ghToken.length)}]`);
    const octokit = getOctokit(ghToken);

    const isPreRelease = env.IS_PRE_RELEASE === 'true';
    console.error(`isPreRelease? ${isPreRelease}`);

    // NOTE: we have to override githubRepo as GITHUB_REPO will be picked up and
    // it is set up to work with the github client, not git-cliff
    let ghRepo = env.GITHUB_REPO; // e.g. 'bytecodealliance/jco'
    if (!ghRepo) {
        throw new Error('GITHUB_REPO not set');
    }
    if (ghRepo.includes('/')) {
        ghRepo = ghRepo.split('/')[1];
    }
    console.error(`using GH repo [${ghRepo}]`);

    const ghOwner = env.GITHUB_OWNER;
    if (!ghOwner) {
        throw new Error('GITHUB_OWNER not set');
    }
    console.error(`using GH owner [${ghOwner}]`);

    // Configure git-cliff repository option
    const gcRepository = env.GIT_CLIFF_REPOSITORY;
    if (!gcRepository) {
        throw new Error('GIT_CLIFF_REPOSITORY not set');
    }
    console.error(`using cliff repository [${gcRepository}]`);

    // Configure git-cliff repository option
    const gcReleaseTag = env.GIT_CLIFF_RELEASE_TAG;
    if (!gcReleaseTag) {
        throw new Error('GIT_CLIFF_RELEASE_TAG not set');
    }
    console.error(`using release tag [${gcReleaseTag}]`);

    // Configure git-cliff repository option
    let gcTagPattern = env.GIT_CLIFF_TAG_PATTERN;
    if (!gcTagPattern) {
        throw new Error('GIT_CLIFF_TAG_PATTERN not set');
    }
    console.error(`using tag pattern [${gcTagPattern}]`);

    // Configure git-cliff config path option
    if (!env.GIT_CLIFF_CONFIG_PATH) {
        throw new Error('GIT_CLIFF_CONFIG_PATH not set');
    }
    const gcConfigPath = resolve(env.GIT_CLIFF_CONFIG_PATH);
    const gcConfigPathExists = await access(gcConfigPath)
        .then(() => true)
        .catch(() => false);
    if (!gcConfigPathExists) {
        throw new Error(`missing git-cliff config @ [${gcConfigPath}]`);
    }
    console.error(`reading git-cliff config from [${gcConfigPath}]`);

    const gitCliffOpts = {
        repository: gcRepository,
        config: gcConfigPath,
        context: true,
        githubRepo: `${ghOwner}/${ghRepo}`,
        tagPattern: gcTagPattern,
    };
    if (isPreRelease) {
        gitCliffOpts.unreleased = true;
    } else {
        gitCliffOpts.current = true;
        gitCliffOpts.tag = gcReleaseTag;
    }

    // Run git-cliff, outputting JSON for the release information
    const cmdOutput = await runGitCliff(gitCliffOpts, {
        stdio: 'pipe',
    });
    const releases = JSON.parse(cmdOutput.stdout);
    if (cmdOutput.exitCode !== 0) {
        console.error(
            'ERROR: failed to generate release metadata\n',
            cmdOutput.stderr
        );
        throw new Error('failed to complete git-cliff command');
    }

    // Ensure releases match what we expect
    if (!Array.isArray(releases) || releases.length !== 1) {
        throw new Error(
            'invalid release metadata JSON, shoudl be a singe element list'
        );
    }
    const release = releases[0];
    const releaseURL = `https://github.com/bytecodealliance/jco/releases/tag/${release.version}`;

    // Go through commits and parse out stuff
    const processedPRs = new Set();
    for (const commit of release.commits) {
        // Find the first PR number link
        const { data: prs } =
            await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
                owner: ghOwner,
                repo: ghRepo,
                commit_sha: commit.id,
            });

        // We expect *one* PR to show up for one commit
        if (prs.length > 1) {
            console.error(
                `Unexpectedly found more than one PR associated with commit [${commit.sha}]`
            );
            continue;
        }

        let prNumber = prs[0].number;
        if (!prNumber) {
            console.error(
                `failed to parse PR number from commit message [${commit.message}]`
            );
            continue;
        }
        if (processedPRs.has(prNumber)) {
            console.error(`skipping already processed PR [${prNumber}]`);
            continue;
        }

        console.error(
            `processing PR [${prNumber}] (commit title: "${commit.title}")`
        );

        await processPullRequestOrIssue({
            octokit,
            ghOwner,
            ghRepo,
            releaseURL,
            issueOrPRNumber: prNumber,
            isIssue: false,
            processPRBody: true,
        });
        processedPRs.add(prNumber);
    }
}

/*
 * Create or update a release notification comment on a given issue or PR
 *
 * @param {CreateOrUpdateCommentArgs} args
 * @returns {Promise<{void}>}
 *
 * @typedef {{
 *   octokit: import('@actions/github').Octokit,
 *   issueOrPRNumber: number,
 *   ghOwner: string,
 *   ghRepo: string,
 *   releaseURL: string,
 *   isIssue: boolean,
 * }} CreateOrUpdateCommentArgs
 *
 */
async function createOrUpdateComment(args) {
    const { octokit, ghOwner, ghRepo, releaseURL, issueOrPRNumber, isIssue } =
        args;

    // Gather list of comments for this issue/PR
    let allComments = [];
    for await (const { data: comments } of octokit.paginate.iterator(
        octokit.rest.issues.listComments,
        {
            owner: ghOwner,
            repo: ghRepo,
            issue_number: issueOrPRNumber,
            per_page: 100,
        }
    )) {
        allComments.push(...comments);
    }

    const existingComment = allComments.find((c) => {
        const commentBody = c.body_html ?? c.body ?? c.body_text;
        return commentBody.includes(COMMENT_INDICATOR);
    });

    // Make or update the comment
    const issuePhrase = isIssue
        ? 'Code that fixes this issue is'
        : 'The code in this PR was made available';
    const commentText = `
:tada: ${issuePhrase} in the following release:
<a href="${releaseURL}">${releaseURL}</a>

${COMMENT_INDICATOR}
`;
    if (existingComment) {
        // If the comment exists, update it (ex. in the case of post-RC release)
        console.error(
            `comment on issue/PR [${issueOrPRNumber}] already exists, updating...`
        );
        await octokit.rest.issues.updateComment({
            owner: ghOwner,
            repo: ghRepo,
            comment_id: existingComment.id,
            body: commentText,
        });
        return;
    } else {
        console.error(
            `no existing comment on PR [${issueOrPRNumber}], creating...`
        );
        // If the comment doesn't already exist, create it
        await octokit.rest.issues.createComment({
            owner: ghOwner,
            repo: ghRepo,
            issue_number: issueOrPRNumber,
            body: commentText,
        });
    }

    console.error(
        `Successfully created/updated comment on PR [${issueOrPRNumber}]`
    );
    return;
}

/**
 * Process a pull request or issue, possibly recurring into related issues.
 *
 * @param {ProcessPullRequestOrIssueArgs} args
 * @returns {Promise<{void}>}
 *
 * @typedef {{
 *   octokit: import('@actions/github').Octokit,
 *   issueOrPRNumber: number,
 *   ghOwner: string,
 *   ghRepo: string,
 *   releaseURL: string,
 *   processPRBody: boolean,
 *   isIssue: boolean,
 * }} ProcessPullRequestOrIssueArgs
 */
async function processPullRequestOrIssue(args) {
    const { octokit, ghOwner, ghRepo, processPRBody, isIssue, releaseURL } =
        args;
    let issueOrPRNumber = args.issueOrPRNumber;

    // If we don't need to recur into the first commit, we can perform a simple
    // create or update of the release indicator with the current list of comments.
    if (!processPRBody) {
        await createOrUpdateComment({
            ...args,
            isIssue,
        });
        return;
    }

    if (processPRBody && isIssue) {
        throw new Error('Issues are not expected to have processable body');
    }

    const { data: pr } = await octokit.rest.pulls.get({
        owner: ghOwner,
        repo: ghRepo,
        pull_number: issueOrPRNumber,
    });
    const prBody = pr.body;

    console.error(`beginning comment processing for PR [${issueOrPRNumber}]`, {
        prBody,
    });

    const updatedIssues = [];

    // Process issue resolution/closure notices done with the shorthand
    for (const match of prBody.matchAll(
        /(fix|fixes|fixed|resolve|resolves|resolved|close|closes|closed)\s+#([\d]+)/gi
    )) {
        console.error('found issue closer numeric issue shorthand match');
        const parsedIssueNumber = parseInt(match[2]);
        if (Number.isSafeInteger(parsedIssueNumber)) {
            updatedIssues.push(parsedIssueNumber);
            await processPullRequestOrIssue({
                octokit,
                ghOwner,
                ghRepo,
                issueOrPRNumber: parsedIssueNumber,
                releaseURL,
                processPRBody: false,
                isIssue: true,
            });
        }
    }

    // Process issue resolution/closure that is done with full URLs
    for (const match of prBody.matchAll(
        /(fix|fixes|fixed|resolve|resolves|resolved|close|closes|closed)\s+([^\s]+)/gi
    )) {
        console.error('found issue closer text match');
        // Attempt to parse out an issue number
        let parsedIssueNumber;
        const needle = match[2];
        if (URL.canParse(needle)) {
            console.error('found issue closer URL match');
            const url = URL.parse(needle);
            if (
                url.hostname == 'github.com' &&
                url.pathname.startsWith(`/${ghOwner}/${ghRepo}/issues/`)
            ) {
                parsedIssueNumber = parseInt(url.pathname.split('/')[3]);
            }
        } else if (needle.startsWith(`${ghOwner}/${ghRepo}#`)) {
            console.error('found issue closer repository shorthand match');
            const numbersAfter = needle
                .slice(`${ghOwner}/${ghRepo}#`.length)
                .split(' ')[0];
            parsedIssueNumber = parseInt(numbersAfter);
        }

        // Process the parsed issue number were were able to find
        if (parsedIssueNumber) {
            updatedIssues.push(parsedIssueNumber);
            await processPullRequestOrIssue({
                octokit,
                ghOwner,
                ghRepo,
                issueOrPRNumber: parsedIssueNumber,
                releaseURL,
                processPRBody: false,
                isIssue: true,
            });
        }
    }

    // If we were able to update an issue, then we can exit early
    if (updatedIssues.length > 0) {
        return;
    }

    // If we were unable to parse out an issue number, leave a comment on the PR itself
    console.error(
        `failed to find any issues resolved in body of PR [${issueOrPRNumber}], leaving comment on PR...`
    );

    await createOrUpdateComment({
        ...args,
        isIssue: false,
    });
}

await main();
