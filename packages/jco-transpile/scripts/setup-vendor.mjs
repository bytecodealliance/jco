import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import runScript from '@npmcli/run-script';

const VENDOR_DIR = fileURLToPath(new URL('../vendor', import.meta.url));
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

const EXPECTED_FILES = ['js-component-bindgen-component.js', 'wasm-tools.js'];

async function pathExists(p) {
    if (!p || typeof p !== 'string') {
        throw new Error('invalid path string');
    }
    return stat(p)
        .then(() => true)
        .catch(() => false);
}

async function allFilesExistInDir(args) {
    const { files, dir } = args;
    if (!files || !Array.isArray(files)) {
        throw new Error('invalid files array');
    }
    if (!dir || typeof dir !== 'string') {
        throw new Error('invalid dir array');
    }
    const paths = files.map((f) => join(dir, f));
    const results = await Promise.all(paths.map(pathExists));
    return results.every((exists) => exists === true);
}

async function main() {
    const expectedFilesExist = await allFilesExistInDir({ files: EXPECTED_FILES, dir: VENDOR_DIR });
    if (expectedFilesExist) {
        console.error('[info] vendor directory already exists, skipping rebuild...');
        return;
    }

    console.error('[info] failed to find expected files, running jco build & vendor...');
    await runScript({ path: PACKAGE_DIR, event: 'setup:jco:build', stdio: 'inherit' });
    await runScript({ path: PACKAGE_DIR, event: 'setup:jco:vendor', stdio: 'inherit' });
}

await main();
