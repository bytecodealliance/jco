import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const STDOUT_MESSAGE = 'Puppeteer reached component stdout';
const STDERR_MESSAGE = 'Puppeteer reached customized component stderr';
const demoRoot = fileURLToPath(new URL('../demo/', import.meta.url));

let browser;
const server = await createServer({
    root: demoRoot,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
});

try {
    await server.listen();
    const address = server.httpServer.address();
    assert(address && typeof address !== 'string', 'Vite did not expose a TCP address');

    browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_PATH || undefined,
        args: (process.env.TEST_PUPPETEER_LAUNCH_ARGS ?? '').split(/[\s,]+/).filter(Boolean),
    });
    const page = await browser.newPage();
    const diagnostics = [];
    let resolveStdout;
    const stdoutReceived = new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error(`stdout did not reach console.log\n${diagnostics.join('\n')}`)),
            5_000,
        );
        resolveStdout = () => {
            clearTimeout(timeout);
            resolve();
        };
    });

    page.on('console', (message) => {
        diagnostics.push(`console.${message.type()}: ${message.text()}`);
        if (message.type() === 'log' && message.text() === STDOUT_MESSAGE) {
            resolveStdout();
        }
    });
    page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.stack ?? error.message}`));
    page.on('requestfailed', (request) => {
        diagnostics.push(`requestfailed: ${request.failure()?.errorText} ${request.url()}`);
    });

    const url = `http://127.0.0.1:${address.port}/`;
    const response = await page.goto(url);
    assert(response?.ok(), `Failed to load ${url}: HTTP ${response?.status()}`);

    await page.waitForFunction(() => document.querySelector('#status')?.dataset.state !== undefined);
    const componentStatus = await page.$eval('#status', (element) => ({
        state: element.dataset.state,
        text: element.textContent,
    }));
    assert.equal(componentStatus.state, 'ready', [...diagnostics, componentStatus.text].join('\n'));

    await page.$eval(
        '#stdout-message',
        (element, message) => {
            element.value = message;
        },
        STDOUT_MESSAGE,
    );
    await page.click('#write-stdout');
    await stdoutReceived;

    await page.$eval(
        '#stderr-message',
        (element, message) => {
            element.value = message;
        },
        STDERR_MESSAGE,
    );
    await page.click('#write-stderr');
    await page.waitForFunction(
        (message) => document.querySelector('#stderr-output')?.textContent.includes(message),
        {},
        STDERR_MESSAGE,
    );
    assert.equal(await page.$eval('#stderr-output', (element) => element.textContent.trim()), STDERR_MESSAGE);

    console.log('browser CLI shim demo passed');
} finally {
    await browser?.close();
    await server.close();
}
