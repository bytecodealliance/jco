import { rejects } from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { installRuntime, optimize } from '../build.js';
import { bundlers } from '../cases.js';

test.concurrent.each(bundlers.flatMap((bundler) => [true, false].map((sideEffects) => ({ bundler, sideEffects }))))(
    '$bundler: resolve the selected runtime with sideEffects=$sideEffects',
    async ({ bundler, sideEffects }) => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-runtime-resolution-'));
        const marker = basename(dir);
        const globals = globalThis as unknown as Record<string, number>;
        try {
            const runtime = join(dir, 'runtime');
            await mkdir(join(runtime, 'dist'), { recursive: true });
            await writeFile(
                join(runtime, 'package.json'),
                JSON.stringify({
                    name: '@bytecodealliance/jco-cm-runtime',
                    type: 'module',
                    sideEffects,
                    exports: { '.': './dist/index.js', './used': './dist/used.js' },
                }),
            );
            await writeFile(join(runtime, 'dist/index.js'), "import './effect.js'; export { used } from './used.js';");
            await writeFile(join(runtime, 'dist/effect.js'), `globalThis[${JSON.stringify(marker)}] = 1;`);
            await writeFile(
                join(runtime, 'dist/used.js'),
                "export function used(x) { return x + 1; } export function unused() { throw Error('UNUSED_INTRINSIC'); }",
            );
            const consumer = join(dir, 'consumer');
            await installRuntime(consumer, runtime);
            for (const [resolution, specifier] of Object.entries({
                file: pathToFileURL(join(runtime, 'dist/index.js')).href,
                package: '@bytecodealliance/jco-cm-runtime',
                subpath: '@bytecodealliance/jco-cm-runtime/used',
            })) {
                delete globals[marker];
                const entry = join(consumer, `${resolution}.mjs`);
                await writeFile(entry, `import { used } from ${JSON.stringify(specifier)}; export { used };`);
                const built = await optimize(entry, bundler, true, { runtimePackageDirectory: runtime });
                const bundle = join(consumer, `${resolution}-bundle.mjs`);
                await writeFile(bundle, built.code);
                const { used } = await import(pathToFileURL(bundle).href);
                assert.equal(used(17), 18);
                assert.equal(used(99), 100);
                assert.equal(globals[marker], sideEffects && resolution !== 'subpath' ? 1 : undefined);
                assert.isFalse(built.code.includes('UNUSED_INTRINSIC'));
                assert.equal(built.chunks, 1);
                assert.deepEqual(built.builtins, []);
                assert.isTrue(Object.keys(built.modules).includes(join(runtime, 'dist/used.js')));
            }
            // A consumer accidentally linked to the current runtime must fail
            // rather than be measured with the frozen package's metadata.
            const wrongConsumer = join(dir, 'wrong-consumer');
            await installRuntime(wrongConsumer);
            const wrongEntry = join(wrongConsumer, 'entry.mjs');
            await writeFile(
                wrongEntry,
                "import * as runtime from '@bytecodealliance/jco-cm-runtime'; export { runtime };",
            );
            await rejects(
                optimize(wrongEntry, bundler, true, { runtimePackageDirectory: runtime }),
                /Runtime resolved outside the selected package/,
            );
        } finally {
            delete globals[marker];
            await rm(dir, { recursive: true, force: true });
        }
    },
);
