import { dirname, join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import process from "node:process";
import { tmpdir } from 'node:os';

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

async function main() {
    try {
        // Pack the tarballs for the runtime, jco-transpile, and jco.
        for (const project of [
            '@bytecodealliance/jco-cm-runtime',
            '@bytecodealliance/jco-transpile',
            '@bytecodealliance/jco',
        ]) {
            run('pnpm', ['--filter', project, 'pack', '--pack-destination', packDir]);
        }

        const jcoRuntimeTarball = findTarball(/^bytecodealliance-jco-cm-runtime-.+\.tgz$/);
        const jcoTranspileTarball = findTarball(/^bytecodealliance-jco-transpile-.+\.tgz$/);
        const jcoTarball = findTarball(/^bytecodealliance-jco-\d.+\.tgz$/);

        // Ensure the jco tarball does not ship obj/
        const tarContents = execFileSync('tar', ['tzf', jcoTarball], {
            encoding: 'utf8',
        });
        const objFiles = tarContents.split('\n').filter((entry) => entry.startsWith('package/obj/'));
        if (objFiles.length > 0) {
            throw new Error(
                `jco tarball ships obj/; browser entry should re-export from jco-transpile instead:\n${objFiles.join('\n')}`,
            );
        }

        // Unzip the packed tarballs, since we need to install overriden dependencies
        for (const tarballPath of [jcoTarball, jcoTranspileTarball, jcoRuntimeTarball]) {
            const pkgDir = basename(tarballPath).replace(/.tgz$/,'');
            mkdirSync(join(packDir, pkgDir));
            execFileSync('tar', ['xzf', tarballPath, '--strip-components=1', '-C', pkgDir ], {
                encoding: 'utf8',
                cwd: packDir,
            });
        }
        // Remove the tarballs
        rmSync(jcoTarball);
        rmSync(jcoTranspileTarball);
        rmSync(jcoRuntimeTarball);

        // Install the freshly packed dependency chain into each parent package.
        const jcoPkgDir = jcoTarball.replace(/.tgz$/,'');
        const jcoTranspilePkgDir = jcoTranspileTarball.replace(/.tgz$/,'');
        const jcoRuntimePkgDir = jcoRuntimeTarball.replace(/.tgz$/,'');
        try {
            run('pnpm', ['add', jcoRuntimePkgDir], {
                cwd: jcoTranspilePkgDir,
            });
        } catch {}
        try {
            // NOTE: pnpm add will *seem* to fail due to ignored build scripts,
            // but we can generally ignore this failure
            run('pnpm', ['add', jcoTranspilePkgDir], {
                cwd: jcoPkgDir,
            });
        } catch {}

        // Create a project directory that we will use to test out the browser build
        mkdirSync(projectDir);
        writeFileSync(
            join(projectDir, 'package.json'),
            JSON.stringify({
                name: 'jco-browser-bundle-smoke',
                private: true,
                type: 'module',
            }),
        );

        // Create a basic main.js which we will use
        const mainJsPath = join(projectDir, 'main.js');
        writeFileSync(
            mainJsPath,
            `
import { generate, generateTypes, transpile } from "@bytecodealliance/jco/component";
if (typeof generate !== "function") throw new Error("generate not exported");
if (typeof generateTypes !== "function") throw new Error("generateTypes not exported");
if (typeof transpile !== "function") throw new Error("transpile not exported");
`,
        );

        // Install Jco (and correspondingly the latest jco-transpile)
        run('pnpm', ['install', jcoPkgDir], {
            cwd: projectDir,
        });

        // Install & run rolldown to build for the browser
        run('pnpm', ['add', '-D', 'rolldown'], {
            cwd: projectDir,
        });
        run(
            'pnpm',
            [
                'exec',
                'rolldown',
                'main.js',
                '--format=esm',
                '--platform=browser',
                '--file=out.js',
                '--external=node:*',
            ],
            { cwd: projectDir },
        );

        if (statSync(join(projectDir, 'out.js')).size === 0) {
            throw new Error('browser bundle is empty');
        }
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

main()
    .catch(err => {
        console.error(`ERROR: ${err}`);
        process.exitCode = 1;
    });
