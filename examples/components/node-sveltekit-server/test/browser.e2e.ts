import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import puppeteer from 'puppeteer';

async function startComponent(t: TestContext): Promise<URL> {
    const child = spawn(
        process.execPath,
        ['--experimental-wasm-jspi', fileURLToPath(new URL('../src/run-transpiled.ts', import.meta.url))],
        {
            env: { ...process.env, PORT: '0' },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
    const exited = new Promise<number | null>((resolve) => child.once('close', resolve));

    t.after(async () => {
        const forceKill = setTimeout(() => child.kill('SIGKILL'), 1_000);

        child.kill();
        await exited;
        clearTimeout(forceKill);
    });

    let output = '';
    let errors = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
        errors += chunk;
    });

    return await new Promise<URL>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Server did not start.\n${output}\n${errors}`)), 60_000);

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            output += chunk;
            const match = output.match(/listening at (http:\/\/127\.0\.0\.1:\d+)\n/);

            if (match?.[1]) {
                clearTimeout(timer);
                resolve(new URL(match[1]));
            }
        });
        child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.once('exit', (code, signal) => {
            clearTimeout(timer);
            reject(new Error(`Server exited (${code ?? signal}).\n${output}\n${errors}`));
        });
    });
}

test('a visitor can manage TODOs in a browser', { timeout: 120_000 }, async (t) => {
    const url = await startComponent(t);
    const browser = await puppeteer.launch({
        headless: process.env.HEADFUL !== '1',
        args: ['--no-sandbox'],
    });

    t.after(() => browser.close());

    const page = await browser.newPage();
    await page.goto(url.href, { waitUntil: 'networkidle0' });

    assert.equal(await page.title(), 'Daymark — a tiny TODO list');
    assert.equal(await page.$eval('.count strong', (element) => element.textContent), '2');

    await page.type('input[name="title"]', 'Exercise the browser UI');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);

    await page.waitForSelector('[aria-label="Complete Exercise the browser UI"]');
    assert.match(await page.$eval('.todos', (element) => element.textContent ?? ''), /Exercise the browser UI/);
    assert.equal(await page.$eval('.count strong', (element) => element.textContent), '3');

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click('[aria-label="Complete Exercise the browser UI"]'),
    ]);

    await page.waitForSelector('[aria-label="Mark Exercise the browser UI as open"]');
    assert.equal(await page.$eval('.count strong', (element) => element.textContent), '2');

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click('[aria-label="Delete Exercise the browser UI"]'),
    ]);

    assert.doesNotMatch(await page.$eval('.todos', (element) => element.textContent ?? ''), /Exercise the browser UI/);
});
