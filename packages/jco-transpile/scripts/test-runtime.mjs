import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CUSTOM_BASE_VARIABLE, RUNTIME_MODES } from '../../../test/helpers/runtime-mode.mjs';

/** Run vitest with the given arguments against one runtime mode. */
async function main() {
    const [mode, ...args] = process.argv.slice(2);
    if (!RUNTIME_MODES.includes(mode)) {
        throw new Error(`usage: test-runtime.mjs <${RUNTIME_MODES.join('|')}> [vitest arguments]`);
    }
    if (mode === 'custom' && !process.env[CUSTOM_BASE_VARIABLE]) {
        throw new Error(
            `set ${CUSTOM_BASE_VARIABLE} to the runtime's package name, directory or URL, e.g. ${CUSTOM_BASE_VARIABLE}=./path/to/runtime/dist`,
        );
    }
    // Use Node to set the mode so the same command works on Windows and Unix.
    const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json'))), 'run', ...args],
        { stdio: 'inherit', env: { ...process.env, JCO_TEST_RUNTIME: mode } },
    );
    process.exitCode = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code) => resolve(code ?? 1));
    });
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
