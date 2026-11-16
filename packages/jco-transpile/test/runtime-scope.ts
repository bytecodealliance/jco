import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

import { parse } from '../src/wasm-tools.js';
import { getTmpDir, nodeExec } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';

const fixture = new URL('./fixtures/components/runtime-scope/component.wat', import.meta.url);
const checkRuntimeScope = fileURLToPath(new URL('./fixtures/runtime-scope/check.mjs', import.meta.url));

for (const instantiation of ['sync', 'async'] as const) {
    test.concurrent(`imports named after globals do not reach the ${instantiation} instance's runtime`, async () => {
        const component = await parse(await readFile(fixture, 'utf8'));
        const { files } = await transpileBytes(component, {
            name: 'component',
            instantiation,
            cmRuntimeEsModule: undefined,
        });
        const directory = await getTmpDir();
        try {
            await writeFiles(files, { baseDir: directory });
            await writeFile(join(directory, 'package.json'), '{"type":"module"}');
            await nodeExec(checkRuntimeScope, join(directory, 'component.js'));
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
}
