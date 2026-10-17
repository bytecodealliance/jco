import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const jco = fileURLToPath(new URL('../../../../packages/jco/dist/jco.js', import.meta.url));
const options = process.argv.slice(2);
// The example's all/build scripts can select a source-built compiler, too.
// Explicit CLI selectors take precedence over this example-only environment option.
if (process.env.JCO_PERRY_CLI_PATH && !options.some((arg) => /^--backend-perry-(cli-path|package)(=|$)/.test(arg))) {
    options.push('--backend-perry-cli-path', process.env.JCO_PERRY_CLI_PATH);
}
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
execFileSync(
    process.execPath,
    [jco, 'componentize', 'src/guest/component.ts', '--backend', 'perry', '-o', 'dist/component.wasm', ...options],
    { cwd: root, stdio: 'inherit' },
);
