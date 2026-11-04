import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { validate, $init } from '../../vendor/js-component-bindgen-component.js';

const run = promisify(execFile);

test.concurrent.each([
    { source: '(assert_malformed (module binary "\\00as") "")', passes: true },
    { source: '(assert_malformed (component quote "(unknown)") "expected")', passes: true },
    { source: '(assert_malformed (module (func (result i32))) "type mismatch")', passes: false },
    { source: '(assert_malformed (component (core module (func (result i32)))) "type mismatch")', passes: false },
])('malformed assertion failure stage: $source', async ({ source, passes }) => {
    const directory = await mkdtemp(join(tmpdir(), 'jco-malformed-'));
    try {
        const path = join(directory, 'fixture.wast');
        await writeFile(path, source);
        await run('cargo', ['xtask', 'build-wast-fixture', path]);
        const fixture = await import(pathToFileURL(`${path}.js`).href);
        const execute = async () =>
            fixture.runWastTest({
                assert,
                expect,
                instantiate: async () => {
                    throw new Error('unexpected instantiation');
                },
                validate: async (artifact: { path: string }) => {
                    await $init;
                    validate(await readFile(join(directory, artifact.path)));
                },
            });
        if (passes) {
            await execute();
        } else {
            await expect(execute()).rejects.toThrow('assert_malformed accepted a well-formed binary');
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
