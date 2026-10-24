import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(execFile);

export async function exec(command: string, args: string[], options: { cwd: string }) {
    try {
        return await execAsync(command, args, options);
    } catch (error) {
        const failure = error as Error & { stdout?: string; stderr?: string };
        throw new Error(failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''), { cause: error });
    }
}

// Use pnpm's executable/CLI path rather than Windows .cmd shell quoting.
const pnpm = process.env.npm_execpath?.includes('pnpm') ? process.env.npm_execpath : 'pnpm';

export const runPnpm = (args: string[], cwd: string) =>
    /\.[cm]?js$/.test(pnpm) ? exec(process.execPath, [pnpm, ...args], { cwd }) : exec(pnpm, args, { cwd });
