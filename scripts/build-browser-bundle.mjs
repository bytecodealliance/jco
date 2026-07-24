import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workDir = mkdtempSync(join(tmpdir(), 'jco-browser-bundle-'));
const packDir = join(workDir, 'pack');
const projectDir = join(workDir, 'project');

function run(command, args, options = {}) {
    console.log(`> ${command} ${args.join(' ')}`);
    execFileSync(command, args, {
        cwd: root,
        stdio: 'inherit',
        ...options,
    });
}

function findTarball(pattern) {
    const matches = readdirSync(packDir).filter((name) => pattern.test(name));
    if (matches.length !== 1) {
        throw new Error(`expected one tarball matching ${pattern}, found: ${matches.join(', ')}`);
    }
    return join(packDir, matches[0]);
}

try {
    for (const project of ['@bytecodealliance/jco-transpile', '@bytecodealliance/jco']) {
        run('pnpm', ['--filter', project, 'pack', '--pack-destination', packDir]);
    }

    const jcoTranspileTarball = findTarball(/^bytecodealliance-jco-transpile-.+\.tgz$/);
    const jcoTarball = findTarball(/^bytecodealliance-jco-\d.+\.tgz$/);
    const tarContents = execFileSync('tar', ['tzf', jcoTarball], {
        encoding: 'utf8',
    });
    const objFiles = tarContents.split('\n').filter((entry) => entry.startsWith('package/obj/'));
    if (objFiles.length > 0) {
        throw new Error(
            `jco tarball ships obj/; browser entry should re-export from jco-transpile instead:\n${objFiles.join('\n')}`,
        );
    }

    mkdirSync(projectDir);
    writeFileSync(
        join(projectDir, 'package.json'),
        JSON.stringify({
            name: 'jco-browser-bundle-smoke',
            private: true,
            type: 'module',
        }),
    );
    writeFileSync(
        join(projectDir, 'main.js'),
        `
import { generate, generateTypes, transpile } from "@bytecodealliance/jco/component";
if (typeof generate !== "function") throw new Error("generate not exported");
if (typeof generateTypes !== "function") throw new Error("generateTypes not exported");
if (typeof transpile !== "function") throw new Error("transpile not exported");
`,
    );

    run('npm', ['install', '--no-save', '--no-audit', '--no-fund', jcoTranspileTarball, jcoTarball], {
        cwd: projectDir,
    });
    run(
        'npx',
        [
            '--yes',
            'esbuild',
            'main.js',
            '--bundle',
            '--format=esm',
            '--platform=browser',
            '--outfile=out.js',
            '--external:node:*',
        ],
        { cwd: projectDir },
    );

    if (statSync(join(projectDir, 'out.js')).size === 0) {
        throw new Error('browser bundle is empty');
    }
} finally {
    rmSync(workDir, { recursive: true, force: true });
}
