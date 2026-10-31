import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Use Node to set the mode so the same command works on Windows and Unix.
const child = spawn(
    process.execPath,
    [
        fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json'))),
        'run',
        ...process.argv.slice(2),
    ],
    { stdio: 'inherit', env: { ...process.env, JCO_TEST_RUNTIME: 'external' } },
);
child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
});
child.on('exit', (code) => {
    process.exitCode = code ?? 1;
});
