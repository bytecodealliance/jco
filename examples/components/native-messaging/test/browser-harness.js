import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Browser, getInstalledBrowsers } from '@puppeteer/browsers';
import puppeteer from 'puppeteer';

const HOST_NAME = 'org.bytecodealliance.jco.native_messaging';
const CHROMIUM_EXTENSION_ID = 'hgnfohcgnhghobomhnlaeacpchnalokk';
const FIREFOX_EXTENSION_ID = 'native-messaging@example.jco';
const FIREFOX_EXTENSION_UUID = '5c2f9a56-7ac7-4f6f-a527-f41f9f9d34b7';
const exampleRoot = fileURLToPath(new URL('../', import.meta.url));
const extensionSource = join(exampleRoot, 'extension');

function withTimeout(promise, milliseconds, description) {
    let timeout;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${description}`)), milliseconds);
        }),
    ]).finally(() => clearTimeout(timeout));
}

async function createResultServer() {
    let resolveResult;
    let rejectResult;
    const result = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    const server = createServer((request, response) => {
        const requestUrl = new URL(request.url, 'http://127.0.0.1');
        if (requestUrl.pathname === '/trigger') {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<!doctype html><title>Native messaging trigger</title>');
            return;
        }
        if (requestUrl.pathname !== '/result') {
            response.writeHead(404).end();
            return;
        }
        const chunks = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('error', rejectResult);
        request.on('end', () => {
            try {
                const body = requestUrl.searchParams.get('result') ?? Buffer.concat(chunks).toString();
                resolveResult(JSON.parse(body));
                response.writeHead(204).end();
            } catch (error) {
                rejectResult(error);
                response.writeHead(400).end();
            }
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert(address && typeof address !== 'string');
    return {
        close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
        result,
        triggerUrl: `http://127.0.0.1:${address.port}/trigger`,
        url: `http://127.0.0.1:${address.port}/result`,
    };
}

async function prepareExtension(root, browser, resultUrl) {
    const extension = join(root, 'extension');
    await cp(extensionSource, extension, { recursive: true });
    await cp(join(extension, `manifest.${browser}.json`), join(extension, 'manifest.json'));
    await writeFile(
        join(extension, 'config.js'),
        `globalThis.TEST_CONFIG = ${JSON.stringify({ browser, hostName: HOST_NAME, resultUrl })};\n`,
    );
    return extension;
}

async function writeNativeManifest(directory, launcher, browser, chromiumExtensionId) {
    await mkdir(directory, { recursive: true });
    const manifest = {
        name: HOST_NAME,
        description: 'Jco native messaging example host',
        path: launcher,
        type: 'stdio',
        ...(browser === 'firefox'
            ? { allowed_extensions: [FIREFOX_EXTENSION_ID] }
            : { allowed_origins: [`chrome-extension://${chromiumExtensionId}/`] }),
    };
    await writeFile(join(directory, `${HOST_NAME}.json`), `${JSON.stringify(manifest, null, 4)}\n`);
}

async function firefoxExecutable() {
    if (process.env.TEST_FIREFOX_PATH) {
        return process.env.TEST_FIREFOX_PATH;
    }
    const cacheDir = process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), '.cache', 'puppeteer');
    const installed = (await getInstalledBrowsers({ cacheDir })).filter(({ browser }) => browser === Browser.FIREFOX);
    assert(
        installed.length > 0,
        'Firefox is not installed; run `pnpm run test:setup:firefox` from the repository root',
    );
    return installed.at(-1).executablePath;
}

async function chromiumExecutable() {
    if (process.env.TEST_CHROMIUM_PATH ?? process.env.PUPPETEER_PATH) {
        return process.env.TEST_CHROMIUM_PATH ?? process.env.PUPPETEER_PATH;
    }
    const cacheDir = process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), '.cache', 'puppeteer');
    const installed = (await getInstalledBrowsers({ cacheDir })).filter(({ browser }) => browser === Browser.CHROME);
    assert(
        installed.length > 0,
        'Chromium is not installed; run `pnpm run test:setup:puppeteer` from the repository root',
    );
    return installed.at(-1).executablePath;
}

async function runFirefox({ extension, hostLog, launcher, root, triggerUrl }) {
    const testHome = join(root, 'home');
    const profile = join(root, 'firefox-profile');
    await writeNativeManifest(join(testHome, '.mozilla', 'native-messaging-hosts'), launcher, 'firefox');

    const browser = await puppeteer.launch({
        browser: 'firefox',
        dumpio: process.env.DEBUG_NATIVE_MESSAGING === '1',
        executablePath: await firefoxExecutable(),
        headless: true,
        protocol: 'webDriverBiDi',
        userDataDir: profile,
        env: { ...process.env, HOME: testHome, JCO_NATIVE_MESSAGING_TEST_LOG: hostLog },
        extraPrefsFirefox: {
            'extensions.webextensions.uuids': JSON.stringify({
                [FIREFOX_EXTENSION_ID]: FIREFOX_EXTENSION_UUID,
            }),
        },
        args: (process.env.TEST_PUPPETEER_LAUNCH_ARGS ?? '').split(/[\s,]+/).filter(Boolean),
    });
    try {
        const installedId = await browser.installExtension(extension);
        assert.equal(installedId, FIREFOX_EXTENSION_ID);
        const page = await browser.newPage();
        await page.goto(triggerUrl);
        await page.waitForFunction(() => document.documentElement.dataset.nativeMessagingExtension === 'loaded', {
            timeout: 5_000,
        });
        return browser;
    } catch (error) {
        await browser.close();
        throw error;
    }
}

async function runChromium({ extension, hostLog, launcher, root, triggerUrl }) {
    const testHome = join(root, 'home');
    const configHome = join(root, 'config');
    const profile = join(root, 'chromium-profile');
    for (const manifestDirectory of [
        profile,
        ...['chromium', 'google-chrome', 'google-chrome-for-testing', 'vivaldi'].map((browserDirectory) =>
            join(configHome, browserDirectory),
        ),
    ]) {
        await writeNativeManifest(
            join(manifestDirectory, 'NativeMessagingHosts'),
            launcher,
            'chromium',
            CHROMIUM_EXTENSION_ID,
        );
    }

    const browser = await puppeteer.launch({
        browser: 'chrome',
        dumpio: process.env.DEBUG_NATIVE_MESSAGING === '1',
        executablePath: await chromiumExecutable(),
        headless: true,
        enableExtensions: true,
        userDataDir: profile,
        env: {
            ...process.env,
            HOME: testHome,
            XDG_CONFIG_HOME: configHome,
            JCO_NATIVE_MESSAGING_TEST_LOG: hostLog,
        },
        args: (process.env.TEST_PUPPETEER_LAUNCH_ARGS ?? '').split(/[\s,]+/).filter(Boolean),
    });
    try {
        const installedId = await browser.installExtension(extension);
        assert.equal(installedId, CHROMIUM_EXTENSION_ID);
        const page = await browser.newPage();
        await page.goto(triggerUrl);
        await page.waitForFunction(() => document.documentElement.dataset.nativeMessagingExtension === 'loaded', {
            timeout: 5_000,
        });
        return browser;
    } catch (error) {
        await browser.close();
        throw error;
    }
}

export async function testBrowser(browserName, launcher) {
    assert.equal(process.platform, 'linux', 'the native-messaging browser harness currently supports Linux');
    const root = await mkdtemp(join(tmpdir(), `jco-native-messaging-${browserName}-`));
    const hostLog = join(root, 'native-host.log');
    const resultServer = await createResultServer();
    let browser;
    try {
        const extension = await prepareExtension(root, browserName, resultServer.url);
        if (browserName === 'firefox') {
            browser = await runFirefox({ extension, hostLog, launcher, root, triggerUrl: resultServer.triggerUrl });
        } else if (browserName === 'chromium') {
            browser = await runChromium({ extension, hostLog, launcher, root, triggerUrl: resultServer.triggerUrl });
        } else {
            throw new Error(`Unsupported browser ${browserName}`);
        }

        const result = await withTimeout(resultServer.result, 60_000, `${browserName} extension result`);
        assert.equal(result.browser, browserName);
        const nativeHostDiagnostic = await readFile(hostLog, 'utf8').catch(() => 'native host was not launched');
        assert.equal(result.ok, true, `${result.message}\nNative host:\n${nativeHostDiagnostic}`);
        assert(result.chunks > 1);
        console.log(`${browserName} native-messaging browser test passed`);
    } catch (error) {
        const targets = browser?.targets().map((target) => `${target.type()}: ${target.url()}`) ?? [];
        error.message = `${error.message}\nBrowser targets:\n${targets.join('\n')}`;
        throw error;
    } finally {
        await browser?.close();
        await resultServer.close();
        await rm(root, { recursive: true, force: true });
    }
}
