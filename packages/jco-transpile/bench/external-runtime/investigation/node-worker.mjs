import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Keep the child handle available for diagnostics, and settle only after close.
// AbortSignal can reject execFile before the process has been reaped.
/**
 * @param {string[]} args
 * @param {{ cwd?: string, signal?: AbortSignal, timeout?: number }} [options]
 */
export function nodeWorker(args, options = {}) {
    const { cwd, signal, timeout = 120_000 } = options;
    const task = exec(process.execPath, args, { cwd, signal, timeout, maxBuffer: 4 * 1024 * 1024 });
    const child = task.child;
    const closed = new Promise((done) => child.once('close', done));
    const done = (async () => {
        try {
            return await task;
        } catch (error) {
            if (child.exitCode === null && child.signalCode === null) {
                child.kill('SIGKILL');
            }
            throw error;
        } finally {
            await closed;
        }
    })();
    return { child, done };
}
