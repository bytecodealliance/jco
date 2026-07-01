import { writeFile, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, relative, dirname } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { componentize } from '@bytecodealliance/componentize-js';

import { suite, test } from 'vitest';

import { transpile, writeFiles } from '../../src//index.js';

import { getTmpDir, runTSCodegen, getRandomPort, nodeExec } from '../helpers.js';

suite(`p2 http`, async () => {
    test('wasi-http-proxy-p2', async () => {
        const tmpDir = await getTmpDir();
        const outFile = resolve(tmpDir, 'out-component-file');

        const tsConfigPath = fileURLToPath(new URL('../fixtures/componentize/runtime/tsconfig.json', import.meta.url));
        const tsPath = fileURLToPath(new URL('../fixtures/componentize/runtime/wasi-http-proxy.ts', import.meta.url));
        const testComponentsOutputDir = fileURLToPath(
            new URL('../fixtures/generated/js-test-components', import.meta.url),
        );

        // Ignore errors from compilation (usually TS warnings)
        await runTSCodegen({
            tsConfigPath,
            configOverrides: {
                include: [relative(dirname(tsConfigPath), tsPath)],
                compilerOptions: {
                    outDir: relative(dirname(tsConfigPath), testComponentsOutputDir),
                },
            },
        });

        const port = await getRandomPort();
        const server = createServer(async (req, res) => {
            if (req.url == '/api/examples') {
                res.writeHead(200, {
                    'Content-Type': 'text/plain',
                    'X-Wasi': 'mock-server',
                    Date: null,
                });
                if (req.method === 'GET') {
                    res.write('hello world');
                } else {
                    req.pipe(res);
                    return;
                }
            } else {
                res.statusCode(500);
            }
            res.end();
        }).listen(port); // transpile component expects this port

        const runtimeName = 'wasi-http-proxy';
        try {
            // componentize
            const componentPath = fileURLToPath(
                new URL('../fixtures/componentize/wasi-http-proxy/source.js', import.meta.url),
            );
            const { component } = await componentize({
                sourcePath: componentPath,
                witPath: fileURLToPath(new URL(`../fixtures/wit/wasi-http-proxy`, import.meta.url)),
                worldName: 'test:jco/command-extended',
            });
            await writeFile(outFile, component);

            // transpile
            const outDir = fileURLToPath(
                new URL(`../fixtures/generated/js-test-components/${runtimeName}`, import.meta.url),
            );
            await mkdir(outDir, { recursive: true });
            const { files } = await transpile(outFile, { name: runtimeName, outDir });
            await writeFiles(files);

            // Run the harness
            await nodeExec(`test/fixtures/generated/js-test-components/${runtimeName}.js`, `--test-port=${port}`);
        } finally {
            server.close();
        }

        await rm(outFile).catch(() => {});
    });
});
