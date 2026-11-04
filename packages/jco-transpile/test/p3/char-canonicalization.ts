import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, expect, test } from 'vitest';

import { parse } from '../../src/wasm-tools.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { getTmpDir, nodeExec, setupAsyncTest } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';

const fixture = join(P3_COMPONENT_FIXTURES_DIR, 'scalar-canonicalization/chars.wat');
const providers = [
    { name: 'inline', cmRuntimeEsModule: undefined },
    { name: 'external', cmRuntimeEsModule: defaultRuntimeUrl.href },
    { name: 'independent', cmRuntimeEsModule: new URL('../fixtures/custom-runtime/', import.meta.url).href },
];

test.concurrent.each(
    providers.flatMap((provider) =>
        [false, true].map((validLiftingOptimization) => ({ ...provider, validLiftingOptimization })),
    ),
)(
    'canonical chars preserve Unicode in direct and future paths ($name, optimization=$validLiftingOptimization)',
    async ({ cmRuntimeEsModule, validLiftingOptimization }) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { name: 'canonical-chars', path: fixture },
            jco: { transpile: { extraArgs: { cmRuntimeEsModule, validLiftingOptimization } } },
        });
        try {
            for (const [bits, char] of [
                [0, '\0'],
                [0x1f600, '😀'],
                [0x10ffff, '\u{10ffff}'],
            ] as const) {
                assert.equal(await instance.direct(bits), char);
                assert.equal(await instance.echo(char), char);
                assert.equal(await instance.send(bits), char);
                assert.equal(await instance.receive(Promise.resolve(char)), char);
            }
            await expect(async () => instance.echo(42)).rejects.toBeInstanceOf(TypeError);
        } finally {
            await cleanup();
        }
    },
);

test.concurrent.each(
    providers.flatMap((provider) =>
        ['direct', 'send'].flatMap((operation) =>
            [0xd800, 0x110000, 0xffffffff].map((bits) => ({ ...provider, operation, bits })),
        ),
    ),
)('invalid guest chars trap through $operation ($name, bits=$bits)', async ({ cmRuntimeEsModule, operation, bits }) => {
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: { name: 'invalid-char', path: fixture },
        jco: { transpile: { extraArgs: { cmRuntimeEsModule } } },
    });
    try {
        await expect(async () => instance[operation](bits)).rejects.toBeInstanceOf(WebAssembly.RuntimeError);
    } finally {
        await cleanup();
    }
});

test.concurrent.each(providers)(
    'char traps use the selected RuntimeError constructor ($name)',
    async ({ cmRuntimeEsModule }) => {
        const directory = await getTmpDir();
        try {
            const { files } = await transpileBytes(await parse(await readFile(fixture, 'utf8')), {
                name: 'char-realm',
                instantiation: 'async',
                asyncMode: 'jspi',
                cmRuntimeEsModule,
            });
            await writeFiles(files, { baseDir: directory });
            await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
            await nodeExec(
                fileURLToPath(new URL('../fixtures/external-runtime/char-realm.mjs', import.meta.url)),
                join(directory, 'char-realm.js'),
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    },
);
