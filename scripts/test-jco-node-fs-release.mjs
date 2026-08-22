import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

function main() {
    const artifactDir = process.env.ARTIFACT_DIR;
    const version = process.env.VERSION;

    if (!artifactDir || !version) {
        throw new Error('ARTIFACT_DIR and VERSION must be set');
    }

    const rootTarball = resolve(artifactDir, `bytecodealliance-jco-node-fs-${version}.tgz`);
    const platformTarball = resolve(artifactDir, `bytecodealliance-jco-node-fs-linux-x64-gnu-${version}.tgz`);

    for (const tarball of [rootTarball, platformTarball]) {
        if (!existsSync(tarball)) {
            throw new Error(`release tarball does not exist: ${tarball}`);
        }
    }

    const testDir = mkdtempSync(join(tmpdir(), 'jco-node-fs-release-'));
    const scopeDir = join(testDir, 'node_modules', '@bytecodealliance');
    const rootPackageDir = join(scopeDir, 'jco-node-fs');
    const platformPackageDir = join(scopeDir, 'jco-node-fs-linux-x64-gnu');
    let fd;

    try {
        mkdirSync(rootPackageDir, { recursive: true });
        mkdirSync(platformPackageDir, { recursive: true });
        extract(rootTarball, rootPackageDir);
        extract(platformTarball, platformPackageDir);

        const require = createRequire(join(testDir, 'smoke-test.cjs'));
        const { fadvise } = require('@bytecodealliance/jco-node-fs');
        fd = openSync(join(rootPackageDir, 'package.json'), 'r');
        fadvise(fd, 0n, 0n, 'normal');
    } finally {
        if (fd !== undefined) {
            closeSync(fd);
        }
        rmSync(testDir, { recursive: true, force: true });
    }
}

function extract(tarball, destination) {
    execFileSync(
        'tar',
        ['--extract', '--gzip', '--file', tarball, '--strip-components=1', '--directory', destination],
        { stdio: 'inherit' },
    );
}

main();
