import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectArg = process.argv[2];

if (!projectArg) {
    throw new Error('usage: node scripts/pack-napi-release.mjs <project-directory>');
}

const projectDir = resolve(workspaceDir, projectArg);
const projectRelativePath = relative(workspaceDir, projectDir);
if (isAbsolute(projectRelativePath) || projectRelativePath.startsWith('..')) {
    throw new Error(`project directory must be inside the workspace: ${projectArg}`);
}

const npmDir = join(projectDir, 'npm');
const releaseDir = join(projectDir, 'release');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args) {
    execFileSync(command, args, { cwd: projectDir, stdio: 'inherit' });
}

run(pnpm, ['run', 'create:npm-dirs']);
run(pnpm, ['run', 'artifacts']);
run(pnpm, ['run', 'prepare-release']);

const platformPackageDirs = readdirSync(npmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(releaseDir, { recursive: true });
run(pnpm, ['pack', '--pack-destination', releaseDir]);

for (const entry of platformPackageDirs) {
    run(npm, ['pack', join(npmDir, entry.name), '--pack-destination', releaseDir]);
}
