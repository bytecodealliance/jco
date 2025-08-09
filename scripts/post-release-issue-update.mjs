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
    for (const commit of release.commits) {
        // Find the first PR number link
        const prNumber = commit.links
            .map((l) => {
                const match = l.text.match(/^\(#([\d]+)\)$/);
                if (!match) {
                    return null;
                }
                return parseInt(match[1]);
            })
            .find((v) => v);
        console.error(`processing PR [${prNumber}]`);

        // Search for existing release comment
        let existingComment;
        for await (const { data: comments } of octokit.paginate.iterator(
            octokit.rest.issues.listComments,
            {
                owner: ghOwner,
                repo: ghRepo,
                issue_number: prNumber,
                per_page: 100,
            }
        )) {
            existingComment = comments.find((c) => {
                const commentBody = c.body_html ?? c.body ?? c.body_text;
                return commentBody.includes(COMMENT_INDICATOR);
            });
            if (existingComment) {
                break;
            }
        }

        // Make or update the comment
        const commentText = `
:tada: The code in this PR was made available in the following release:
<a href="${releaseURL}">${releaseURL}</a>

${COMMENT_INDICATOR}
`;
        if (existingComment) {
            // If the comment exists, update it (ex. in the case of post-RC release)
            console.error(
                `comment on PR [${prNumber}] already exists, updating...`
            );
            await octokit.rest.issues.updateComment({
                owner: ghOwner,
                repo: ghRepo,
                comment_id: existingComment.id,
                body: commentText,
            });
            continue;
        } else {
            console.error(
                `no existing comment on PR [${prNumber}], creating...`
            );
            // If the comment doesn't already exist, create it
            await octokit.rest.issues.createComment({
                owner: ghOwner,
                repo: ghRepo,
                issue_number: prNumber,
                body: commentText,
            });
        }
        console.error(
            `Successfully created/updated comment on PR [${prNumber}]`
        );
    }
}

await main();
