import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";

import {
    Browser,
    computeExecutablePath,
    detectBrowserPlatform,
    install,
    resolveBuildId,
    ChromeReleaseChannel,
} from "@puppeteer/browsers";

/**
 * Robustly install puppeteer, handling the case where browser folder
 * exists but the executable is missing.
 */
async function main() {
    const browser = Browser.CHROME;
    let buildId = process.env.PUPPETEER_VERSION;
    if (!buildId) {
        buildId = await resolveBuildId(
            Browser.CHROME,
            process.platform,
            ChromeReleaseChannel.STABLE,
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
        console.error(`[info] chrome already installed: ${executablePath}`);
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
    console.error(`[info] chrome installed: ${installedBrowser.executablePath}`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
