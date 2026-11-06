import assert from 'node:assert/strict';
import { readFile, readdir, readlink, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// A completed functional command does not prove its CLI/browser workers exited.
// CI collects this matrix only on Linux, where /proc supplies the process view.
export async function assertBenchmarkIdle() {
    assert.equal(process.platform, 'linux', 'The benchmark process audit requires Linux /proc');
    const workspace = await realpath(new URL('../../..', import.meta.url));
    const live = [];
    for (const pid of await readdir('/proc')) {
        if (!/^\d+$/.test(pid) || Number(pid) === process.pid) {
            continue;
        }
        try {
            const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
            if (stat.slice(stat.lastIndexOf(') ') + 2).startsWith('Z ')) {
                continue;
            }
            const cwd = await readlink(`/proc/${pid}/cwd`);
            if (cwd !== workspace && !cwd.startsWith(workspace + sep)) {
                continue;
            }
            const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
            const command = (await readFile(`/proc/${pid}/comm`, 'utf8')).trim();
            if (['bash', 'sh', 'rg'].includes(command)) {
                continue;
            }
            const kind = args.some((arg) => arg.endsWith('/test/p3/cli-runner.js'))
                ? 'fixture worker'
                : args.some((arg) => arg.includes('/node_modules/vitest/'))
                  ? 'Vitest'
                  : args.some((arg) => arg.includes('/chrome-linux64/chrome'))
                    ? 'browser'
                    : ['cargo', 'rustc'].includes(command)
                      ? 'compiler'
                      : args.some(
                              (arg) =>
                                  arg.endsWith('bench-external-runtime.mjs') ||
                                  arg.endsWith('investigate-external-runtime.mjs') ||
                                  arg.endsWith('frozen-replay.mjs') ||
                                  arg.endsWith('frozen-runtime-runner.mjs') ||
                                  arg.endsWith('frozen-runtime-trace.mjs') ||
                                  arg.endsWith('matched-runner.mjs') ||
                                  arg.endsWith('matched-collector.mjs') ||
                                  arg.endsWith('/source/trace.mjs') ||
                                  arg.endsWith('jco-matched-factory-producer') ||
                                  arg.endsWith('jco-matched-named-producer') ||
                                  arg.endsWith('/bench/external-runtime/runner.mjs') ||
                                  arg.endsWith('/bench/external-runtime/trace.mjs'),
                          )
                        ? 'benchmark worker'
                        : undefined;
            if (kind) {
                live.push({ pid: Number(pid), kind, command, cwd });
            }
        } catch (error) {
            if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(error.code)) {
                throw error;
            }
        }
    }
    const result = {
        at: new Date().toISOString(),
        workspace,
        pidNamespace: await readlink('/proc/self/ns/pid'),
        live,
    };
    console.log(JSON.stringify(result));
    assert.deepEqual(live, [], 'Functional, build or benchmark workers remain; timing requires an idle workspace');
    return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    await assertBenchmarkIdle();
}
