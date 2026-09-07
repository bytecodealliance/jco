import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

async function main() {
    const { PROJECT, ARTIFACT_DIR, ARTIFACT_NAME, GH_REF_TYPE, IS_PRERELEASE, PRERELEASE_TAG } = process.env;
    if (!PROJECT || !ARTIFACT_DIR || !ARTIFACT_NAME) {
        throw new Error('PROJECT, ARTIFACT_DIR, and ARTIFACT_NAME must be set');
    }
    if (basename(ARTIFACT_NAME) !== ARTIFACT_NAME || !ARTIFACT_NAME.endsWith('.tgz')) {
        throw new Error('ARTIFACT_NAME must be a tarball filename');
    }

    const artifactDir = resolve(ARTIFACT_DIR);
    const files = (await readdir(artifactDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    if (!files.includes(ARTIFACT_NAME)) {
        throw new Error(`Missing root package tarball: ${ARTIFACT_NAME}`);
    }

    const tarballs = [];
    if (PROJECT === 'jco-node-fs') {
        tarballs.push(
            ...files
                .filter(
                    (name) =>
                        name !== ARTIFACT_NAME &&
                        name.startsWith('bytecodealliance-jco-node-fs-') &&
                        name.endsWith('.tgz'),
                )
                .sort(),
        );
        if (tarballs.length === 0) {
            throw new Error('Missing jco-node-fs platform tarballs');
        }
    }
    // Publish platform packages before the root package that depends on them.
    tarballs.push(ARTIFACT_NAME);

    // We publish prebuilt artifacts, so source-tree Git checks do not apply.
    const args = ['publish', '--verbose', '--access=public', '--provenance', '--no-git-checks'];
    if (GH_REF_TYPE !== 'tag') {
        args.push('--dry-run');
    }
    if (IS_PRERELEASE === 'true') {
        if (!PRERELEASE_TAG || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(PRERELEASE_TAG)) {
            throw new Error('PRERELEASE_TAG must be a valid distribution tag');
        }
        args.push('--tag', PRERELEASE_TAG);
    }

    for (const tarball of tarballs) {
        // Pass the artifact directly; workspace filtering would repack source.
        execFileSync('pnpm', [...args, resolve(artifactDir, tarball)], { stdio: 'inherit' });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
