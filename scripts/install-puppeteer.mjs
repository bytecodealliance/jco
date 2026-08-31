import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";

import {
    Browser,
    BrowserTag,
    ChromeReleaseChannel,
    computeExecutablePath,
    detectBrowserPlatform,
    install,
    resolveBuildId,
} from "@puppeteer/browsers";

/**
 * Robustly install puppeteer, handling the case where browser folder
 * exists but the executable is missing.
 */
async function main() {
    const requestedBrowser = process.argv[2] ?? "chrome";
    if (requestedBrowser !== "chrome" && requestedBrowser !== "firefox") {
        throw new Error(`unsupported Puppeteer browser: ${requestedBrowser}`);
    }

    const browser = requestedBrowser === "firefox" ? Browser.FIREFOX : Browser.CHROME;
    let buildId =
        requestedBrowser === "firefox" ? process.env.PUPPETEER_FIREFOX_VERSION : process.env.PUPPETEER_VERSION;
    if (!buildId) {
        buildId = await resolveBuildId(
            browser,
            process.platform,
            requestedBrowser === "firefox" ? BrowserTag.NIGHTLY : ChromeReleaseChannel.STABLE,
        );
    }

    if (!buildId) {
        throw new Error("failed to resovle build ID");
    }

    const platform = detectBrowserPlatform();
    if (!platform) {
        throw new Error("Could not detect browser platform");
    }

    const cacheDir =
          process.env.PUPPETEER_CACHE_DIR ??
          path.join(process.env.HOME ?? process.cwd(), ".cache", "puppeteer");

    const executablePath = computeExecutablePath({
        browser,
        buildId,
        cacheDir,
        platform,
    });

    try {
        await fs.access(executablePath);
        console.error(`[info] ${requestedBrowser} already installed: ${executablePath}`);
        return;
    } catch {
        const browserDir = path.join(cacheDir, browser, `${platform}-${buildId}`);
        console.error(`[info] executable missing; removing incomplete install: ${browserDir}`);
        await fs.rm(browserDir, { recursive: true, force: true });
    }

    const installedBrowser = await install({
        browser,
        buildId,
        cacheDir,
        platform,
    });

    await fs.access(installedBrowser.executablePath);
    console.error(`[info] ${requestedBrowser} installed: ${installedBrowser.executablePath}`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
