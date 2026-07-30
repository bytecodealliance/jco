// see: https://github.com/bytecodealliance/jco/issues/1787
import { join } from 'node:path';

import { suite, test } from 'vitest';

import { cli, filesystem } from '@bytecodealliance/preview3-shim';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest, getTmpDir } from '../helpers.js';
import { COMPONENT_FIXTURES_DIR } from '../common.js';

suite('jco #7874', async () => {
    test('sync', async () => {
        const name = 'filesystem-open-errors';

        // Set up shim (this test requires one preopen)
        const p2Shim = new WASIShim().getImportObject();
        const tmpDir = await getTmpDir();
        filesystem._addPreopen('/test', tmpDir);
        const imports = {
            'wasi:io/poll': p2Shim['wasi:io/poll'],
            'wasi:io/error': p2Shim['wasi:io/error'],
            'wasi:io/streams': p2Shim['wasi:io/streams'],
            'wasi:cli/terminal-input': p2Shim['wasi:cli/terminal-input'],
            'wasi:cli/terminal-output': p2Shim['wasi:cli/terminal-output'],
            'wasi:cli/terminal-stdin': p2Shim['wasi:cli/terminal-stdin'],
            'wasi:cli/terminal-stdout': p2Shim['wasi:cli/terminal-stdout'],
            'wasi:cli/terminal-stderr': p2Shim['wasi:cli/terminal-stderr'],

            // P2 & P3
            'wasi:cli/stdout': { ...p2Shim['wasi:cli/stdout'], ...cli.stdout },
            'wasi:cli/stderr': { ...p2Shim['wasi:cli/stderr'], ...cli.stderr },
            'wasi:cli/stdin': { ...p2Shim['wasi:cli/stdin'], ...cli.stdin },

            // P3
            'wasi:cli/exit': cli.exit,
            'wasi:cli/environment': cli.environment,
            'wasi:filesystem/types': filesystem.types,
            'wasi:filesystem/preopens': filesystem.preopens,
        };

        // Transpile & Instantiate the module
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(COMPONENT_FIXTURES_DIR, `${name}.wasm`),
                imports,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });

        await instance['wasi:cli/run@0.3.0'].run();

        await cleanup();
    });
});
