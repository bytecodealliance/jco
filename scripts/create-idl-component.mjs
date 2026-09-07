import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const jco = fileURLToPath(new URL('../packages/jco/dist/jco.js', import.meta.url));

/** @param {string} command @param {string[]} args */
function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${command} failed (${result.signal ?? result.status})`);
    }
}

const output = join(root, 'packages/jco/test/output/idl');
mkdirSync(output, { recursive: true });

// Generate WIT from the WebIDL fixtures before building their components.
run('cargo', ['xtask', 'generate', 'webidl-tests']);
for (const [name, world] of [
    ['dom', 'window-test'],
    ['console', 'console-test'],
]) {
    const fixture = `packages/jco/test/fixtures/wit/idl/${name}`;
    run(process.execPath, [
        jco,
        'componentize',
        `${fixture}.js`,
        '--wit',
        `${fixture}.wit`,
        '-o',
        join(output, `${name}.component.wasm`),
        '--disable',
        'stdio',
        '--disable',
        'random',
        '--disable',
        'clocks',
        '--disable',
        'http',
        '--world-name',
        world,
    ]);
    run(process.execPath, [
        jco,
        'transpile',
        join(output, `${name}.component.wasm`),
        '-o',
        join(output, `${name}-test`),
    ]);
}
