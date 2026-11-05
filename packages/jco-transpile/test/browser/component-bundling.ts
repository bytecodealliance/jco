/** Exercise Vite development and production loading of the component transpiler in a browser. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';
import { build, createServer, preview } from 'vite';
import { assert, test } from 'vitest';

// Keep the entrypoint inside the package so Vite resolves the actual built module and vendor assets.
const root = fileURLToPath(new URL('../fixtures/browser/component-bundling/', import.meta.url));

test.concurrent.each(['development', 'production'] as const)(
    'Vite %s loads and runs the component build',
    async (mode) => {
        const outDir = await mkdtemp(join(tmpdir(), 'jco-vite-component-'));
        const config = {
            configFile: false as const,
            root,
            cacheDir: join(outDir, 'cache'),
            logLevel: 'silent' as const,
            build: { outDir: join(outDir, 'dist'), emptyOutDir: true, assetsInlineLimit: 0 },
            server: {
                host: '127.0.0.1',
                port: 0,
                fs: { allow: [fileURLToPath(new URL('../../../', import.meta.url))] },
            },
            preview: { host: '127.0.0.1', port: 0 },
        };
        let closeServer: (() => Promise<void>) | undefined;
        let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
        try {
            // Both modes must fetch and instantiate every core module, not just build successfully.
            let url: string;
            if (mode === 'production') {
                await build(config);
                const server = await preview(config);
                closeServer = () =>
                    new Promise<void>((resolve, reject) =>
                        server.httpServer.close((error) => (error ? reject(error) : resolve())),
                    );
                url = server.resolvedUrls!.local[0];
            } else {
                const server = await createServer(config);
                closeServer = () => server.close();
                await server.listen();
                url = server.resolvedUrls!.local[0];
            }
            browser = await puppeteer.launch({ executablePath: env.PUPPETEER_PATH, args: ['--no-sandbox'] });
            const page = await browser.newPage();
            const errors: string[] = [];
            page.on('pageerror', (error) => errors.push(String(error)));
            await page.goto(url);
            await page.waitForFunction(() => 'componentBundling' in globalThis);
            const result = await page.evaluate(async () => {
                const state = globalThis as typeof globalThis & {
                    componentBundling: Promise<{ files?: string[]; error?: string }>;
                };
                return state.componentBundling;
            });
            assert.deepStrictEqual(errors, []);
            assert.isUndefined(result.error);
            assert.include(result.files, 'empty.js');
        } finally {
            // Close network and browser resources even when loading or compilation fails.
            await browser?.close();
            await closeServer?.();
            await rm(outDir, { recursive: true, force: true });
        }
    },
);
