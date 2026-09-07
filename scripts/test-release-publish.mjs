import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
    const { ARTIFACT_DIR, PROJECT } = process.env;
    if (!ARTIFACT_DIR || !PROJECT) {
        throw new Error('ARTIFACT_DIR and PROJECT must be set');
    }

    const workspaceDir = fileURLToPath(new URL('../', import.meta.url));
    const workflow = await readFile(resolve(workspaceDir, '.github/workflows/release.yml'), 'utf8');
    // Exercise the actual publisher, not a separate copy of its command. In
    // particular, workspace filtering must not replace the supplied tarball.
    const publisher = workflow.match(/^ {10}publish_package\(\) \{\n[\s\S]*?^ {10}\}/m)?.[0];
    assert(publisher, 'release.yml must define publish_package');

    const tarballs = (await readdir(ARTIFACT_DIR)).filter((name) => name.endsWith('.tgz')).sort();
    assert(tarballs.length > 0, 'release artifacts must include at least one tarball');
    for (const filename of tarballs) {
        const tarball = resolve(ARTIFACT_DIR, filename);
        const manifest = JSON.parse(
            execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
        );
        const expectedHash = createHash('sha1')
            .update(await readFile(tarball))
            .digest('hex');
        const output = execFileSync(
            'bash',
            [
                '-euo',
                'pipefail',
                '-c',
                [
                    'PUBLISH_ARGS=(--dry-run --no-git-checks --ignore-scripts --json)',
                    publisher,
                    'publish_package "$PACKAGE_FILE_PATH"',
                ].join('\n'),
            ],
            {
                cwd: workspaceDir,
                env: { ...process.env, PACKAGE_FILE_PATH: tarball },
                encoding: 'utf8',
            },
        );
        const published = JSON.parse(output);
        assert.equal(published.name, manifest.name, `${filename}: publisher selected the wrong package`);
        assert.equal(published.version, manifest.version, `${filename}: publisher selected the wrong version`);
        assert.equal(published.shasum, expectedHash, `${filename}: publisher did not use the tested tarball`);
        console.log(`Verified publish target and tarball: ${published.name}@${published.version}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
