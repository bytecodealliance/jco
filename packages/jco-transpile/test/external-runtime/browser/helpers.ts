import { rm } from 'node:fs/promises';
import { env } from 'node:process';
import { pathToFileURL } from 'node:url';

import puppeteer, { type Browser } from 'puppeteer';

import { getTmpDir, startTestWebServer } from '../../helpers.js';

export async function withBrowser(run: (browser: Browser, serverPort: number, outDir: string) => Promise<void>) {
    const outDir = await getTmpDir();
    let browser: Browser | undefined;
    let closeServer: (() => Promise<void>) | undefined;
    try {
        const server = await startTestWebServer({
            routes: [
                { urlPrefix: '/tmpdir/', basePathURL: pathToFileURL(`${outDir}/`) },
                { basePathURL: new URL('../../../../', import.meta.url) },
            ],
        });
        closeServer = server.cleanup;
        browser = await puppeteer.launch({ executablePath: env.PUPPETEER_PATH });
        await run(browser, server.serverPort, outDir);
    } finally {
        await browser?.close();
        await closeServer?.();
        await rm(outDir, { recursive: true, force: true });
    }
}
