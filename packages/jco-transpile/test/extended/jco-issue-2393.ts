import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import * as cli from '@bytecodealliance/preview3-shim/cli';
import * as clocks from '@bytecodealliance/preview3-shim/clocks';

import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

// Supply the standard WASI imports, overriding arguments and output per instance.
function wasiImports(namespace: string, interfaces: Record<string, unknown>) {
    return Object.fromEntries(
        Object.entries(interfaces)
            .filter(([name]) => !name.startsWith('_'))
            .map(([name, value]) => [
                `wasi:${namespace}/${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
                value,
            ]),
    );
}

suite('jco issue 2393', () => {
    test.concurrent.each([false, true])(
        'Rust WASI P3 args survive realloc with fat LTO (minify=%s)',
        async (minify) => {
            const args = ['jco-issue-2393', 'a', 'two words', '🌍'];
            const output = Promise.withResolvers<string>();
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    path: join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-2393/component.wasm'),
                    imports: {
                        ...wasiImports('cli', cli),
                        ...wasiImports('clocks', clocks),
                        'wasi:cli/environment': {
                            ...cli.environment,
                            getArguments: () => args,
                        },
                        'wasi:cli/stdout': {
                            writeViaStream: async (stream: AsyncIterable<Uint8Array>) => {
                                const chunks: Uint8Array[] = [];
                                for await (const chunk of stream) {
                                    chunks.push(chunk);
                                    // Rust keeps stdout open after run returns. Capture
                                    // the complete println! without waiting for EOF.
                                    if (chunk.includes(10)) {
                                        break;
                                    }
                                }
                                output.resolve(Buffer.concat(chunks).toString('utf8'));
                                return { tag: 'ok' };
                            },
                        },
                        'wasi:cli/exit': {
                            exit: () => {
                                throw new Error('unexpected wasi:cli/exit');
                            },
                            exitWithCode: () => {
                                throw new Error('unexpected wasi:cli/exit-with-code');
                            },
                        },
                    },
                },
                jco: { transpile: { extraArgs: { minify } } },
            });
            try {
                await instance.run.run();
                assert.strictEqual(await output.promise, 'hello ["jco-issue-2393", "a", "two words", "🌍"]\n');
            } finally {
                await cleanup();
            }
        },
    );
});
