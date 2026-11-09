import { spawn } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const transpileDirectory = fileURLToPath(new URL('../packages/jco-transpile/', import.meta.url));

/**
 * Read a run artifact, allowing reporting when a build or benchmark ended early.
 * @param {string} path Artifact path.
 * @returns {Promise<string | undefined>}
 */
async function readOptional(path) {
    try {
        return await readFile(path, 'utf8');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
        return undefined;
    }
}

/** Publish the latest results to the GitHub run summary, or print them locally. */
async function publishSummary() {
    const output = resolve(
        transpileDirectory,
        process.env.JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT ?? 'bench/output/external-runtime-named',
    );
    const latestSource = await readOptional(join(output, 'latest.json'));
    const sections = ['# Runtime bench'];

    if (latestSource) {
        const latest = JSON.parse(latestSource);
        const statuses = {
            complete: '**Benchmark completed successfully.**',
            failed: '**Benchmark failed.**',
            running: '**Benchmark did not finish.**',
        };
        sections.push(statuses[latest.status] ?? '**Benchmark status is unknown.**');
        if (latest.error) {
            sections.push(
                String(latest.error)
                    .split('\n')
                    .map((line) => `> ${line}`)
                    .join('\n'),
            );
        }

        const report = await readOptional(join(latest.runDir, 'summary.md'));
        sections.push(
            report ?? 'No completed measurement report is available. Check the job logs and partial artifacts.',
        );
    } else {
        sections.push('No benchmark results were produced. Check the setup and build steps in the job logs.');
    }

    sections.push('Download the `runtime-bench` artifact for available raw measurements, provenance and reports.');
    const markdown = sections.join('\n\n') + '\n';
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
    } else {
        process.stdout.write(markdown);
    }
}

/**
 * Run a command to completion, streaming output and stopping on failure.
 * @param {string} command Executable to invoke.
 * @param {string[]} args Arguments passed directly to the executable.
 * @param {string} [cwd] Working directory for the command.
 * @returns {Promise<void>}
 */
async function run(command, args, cwd = workspace) {
    console.log(`> ${command} ${args.join(' ')}`);
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: 'inherit',
            env: {
                ...process.env,
                JCO_TEST_RUNTIME: 'inline',
                JCO_EXTERNAL_RUNTIME_BENCH_PORTFOLIO: 'full',
            },
        });

        child.once('error', reject);
        child.once('close', (code, signal) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${command} failed (${signal ? `signal ${signal}` : `exit ${code}`})`));
            }
        });
    });
}

/**
 * Build the workspace inputs and run the existing full runtime benchmark suite.
 * @param {string[]} [args] CLI arguments; --summary publishes results without running benchmarks.
 * @returns {Promise<void>}
 */
export async function main(args = []) {
    const { values } = parseArgs({
        args,
        options: {
            'skip-build': { type: 'boolean', default: false },
            summary: { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h' },
        },
    });

    if (values.help) {
        console.log(`Usage: node script/bench-runtime.mjs [--skip-build] [--summary]

Install dependencies, build the transpiler/runtime/fixtures, verify bundled
correctness, and measure full inline/external parity. Requires Node.js 24+,
pnpm 11, and the repository's Rust toolchain. Run on an otherwise idle machine.
--skip-build reuses installed dependencies and existing build artifacts.
--summary publishes existing results to the GitHub run summary, or prints them locally.
Results: packages/jco-transpile/bench/output/external-runtime-named`);
        return;
    }

    if (values.summary) {
        await publishSummary();
        return;
    }

    if (!values['skip-build']) {
        await run('pnpm', ['install', '--frozen-lockfile']);
        await run('pnpm', ['--filter', '@bytecodealliance/preview2-shim', 'run', 'build']);
        await run('pnpm', ['--filter', '@bytecodealliance/jco-cm-runtime', 'run', 'build']);
        await run('pnpm', ['--filter', '@bytecodealliance/jco-transpile', 'run', 'build']);
        await run('pnpm', ['--filter', '@bytecodealliance/jco', 'run', 'build:test:components']);
    }

    // The timed suite verifies its own bundles before measuring them.
    await run('pnpm', ['run', 'types:check:bench:external-runtime'], transpileDirectory);
    if (process.platform === 'linux') {
        await run(process.execPath, ['scripts/assert-external-runtime-bench-idle.mjs'], transpileDirectory);
    } else {
        console.log('Process auditing requires Linux /proc; ensure the machine is otherwise idle.');
    }

    // Every measurement run compares both modes from this build.
    await run('pnpm', ['run', 'bench:external-runtime'], transpileDirectory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await main(process.argv.slice(2));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
