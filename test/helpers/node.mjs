import { argv, env, execArgv } from 'node:process';
import { spawn } from 'node:child_process';

// Node 22's experimental JSPI exposes the older Suspender API, which cannot
// instantiate bindings that use promising/Suspending, even with its JSPI flag.
export const hasJspi = typeof WebAssembly.promising === 'function' && typeof WebAssembly.Suspending === 'function';

/** Execute a Node script, capture both pipes, and check its expected exit code. */
export async function executeNodeScript(cmd, ...args) {
    if (!cmd) {
        throw new Error('cmd not specified');
    }
    const options = typeof args.at(-1) === 'object' ? args.pop() : {};
    const expectedExitCode = options.expectedExitCode ?? 0;
    let stdout = '',
        stderr = '';
    await new Promise((resolve, reject) => {
        const processCmd = argv[0];
        const cmdArgs = ['--no-warnings', ...execArgv, cmd, ...args];
        const cp = spawn(processCmd, cmdArgs, {
            stdio: 'pipe',
        });
        if (options.closeStdin) {
            cp.stdin.end();
        }
        cp.stdout.on('data', (chunk) => {
            stdout += chunk;
            if (env.JCO_DEBUG) {
                console.error(`[exec] [cmd=${cmd}] [stdout] ${chunk}`);
            }
        });
        cp.stderr.on('data', (chunk) => {
            stderr += chunk;
            if (env.JCO_DEBUG) {
                console.error(`[exec] [cmd=${cmd}] [stderr] ${chunk}`);
            }
        });
        cp.on('error', reject);
        // The exit event can arrive before the child's stdout/stderr have been drained.
        cp.on('close', (code, signal) => {
            if (code === expectedExitCode) {
                resolve();
                return;
            }

            const msg = [
                `expected exit code [${expectedExitCode}], received [${code ?? signal}] while executing [${processCmd} ${cmdArgs.join(' ')}]:`,
                'STDOUT:',
                stdout.toString(),
                'STDERR:',
                stderr.toString(),
            ].join('\n');
            reject(new Error(msg));
        });
    });
    return { stdout, stderr };
}
