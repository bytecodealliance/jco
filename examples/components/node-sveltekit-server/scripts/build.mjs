import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const fromProject = (...segments) => resolve(projectRoot, ...segments);

const typesCommand = [
    'types',
    fromProject('wit'),
    '--instantiation',
    'async',
    '--async-mode',
    'jspi',
    '--async-exports',
    '*',
    '--world-name',
    'component',
    '--out-dir',
    fromProject('generated/types'),
];

const componentizeCommand = [
    'componentize',
    fromProject('src/server.ts'),
    '--bundle',
    '--bundle-config',
    fromProject('scripts/bundle-config.mjs'),
    '--backend',
    'starlingmonkey',
    '--world-name',
    'component',
    '--with-nodejs-http-via',
    'direct',
    '--disable',
    'http',
    'fetch-event',
    '--wit',
    fromProject('wit'),
    '--out',
    fromProject('component.wasm'),
];

const transpileCommand = [
    'transpile',
    fromProject('component.wasm'),
    '--instantiation',
    'async',
    '--async-mode',
    'jspi',
    '--async-exports',
    '*',
    '--no-wasi-shim',
    '--map',
    'jco:node/http@0.1.0=jco:node/http@0.1.0',
    '--map',
    'jco:node/fs@0.1.0=jco:node/fs@0.1.0',
    '--map',
    'jco:node/process@0.1.0=jco:node/process@0.1.0',
    '--map',
    'jco:node/tty@0.1.0=jco:node/tty@0.1.0',
    '--out-dir',
    fromProject('dist/transpiled'),
];

function runJco(command) {
    const jco = fileURLToPath(new URL('jco.js', import.meta.resolve('@bytecodealliance/jco')));

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [jco, ...command], { stdio: 'inherit' });

        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (signal) {
                process.kill(process.pid, signal);
            } else if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Jco exited with status ${code ?? 1}`));
            }
        });
    });
}

const operation = process.argv[2];
let selectedCommands;

if (operation === 'types') {
    selectedCommands = [typesCommand];
} else if (operation === 'componentize') {
    selectedCommands = [componentizeCommand];
} else if (operation === 'transpile') {
    selectedCommands = [transpileCommand];
}

if (!selectedCommands) {
    console.error('Usage: node scripts/build.mjs <types|componentize|transpile>');
    process.exitCode = 1;
} else {
    for (const command of selectedCommands) {
        await runJco(command);
    }
}
