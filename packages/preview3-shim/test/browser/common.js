import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { assert, vi } from "vitest";
import { transpile } from "@bytecodealliance/jco";

import { startTestServer } from "../../../preview2-shim/test/common.ts";

const FIXTURES = fileURLToPath(
  new URL("../../../jco-transpile/test/fixtures/components/p3/", import.meta.url),
);
const HARNESS = fileURLToPath(new URL("./fixtures/harness/", import.meta.url));

export async function writeTranspiledFixture(root, fixture) {
  const name = basename(fixture, ".wasm").replaceAll(/[^A-Za-z0-9_-]/g, "-");
  const outputDir = join(root, name);
  await mkdir(outputDir, { recursive: true });
  const { files } = await transpile(await readFile(join(FIXTURES, fixture)), {
    name: "component",
    outDir: outputDir,
    optimize: false,
    asyncMode: "jspi",
    asyncExports: ["wasi:cli/run#run"],
  });

  let entry;
  for (const [outputPath, contents] of Object.entries(files)) {
    const target = isAbsolute(outputPath) ? outputPath : join(outputDir, outputPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
    if (basename(target) === "component.js") {
      entry = relative(root, target).replaceAll("\\", "/");
    }
  }
  if (!entry) {
    throw new Error(`transpile did not produce component.js for ${fixture}`);
  }
  return entry;
}

export async function runBrowserCase(browserCase) {
  const outputRoot = await mkdtemp(join(process.cwd(), ".preview3-browser-"));
  let server;
  let page;
  try {
    const entry = await writeTranspiledFixture(outputRoot, browserCase.fixture);
    server = await startTestServer({ transpiledOutputDir: outputRoot, htmlDir: HARNESS });
    page = await server.browser.newPage();
    const diagnostics = [];
    page.on("console", (message) =>
      diagnostics.push(`console.${message.type()}: ${message.text()}`),
    );
    page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.stack ?? error.message}`));
    page.on("requestfailed", (request) =>
      diagnostics.push(`requestfailed: ${request.failure()?.errorText} ${request.url()}`),
    );

    const params = new URLSearchParams({ entry });
    if (browserCase.action) {
      params.set("action", browserCase.action);
    }
    const url = `${server.baseURL}/index.html#${params}`;
    const response = await page.goto(url);
    assert.ok(response?.ok(), `failed to load ${url}: HTTP ${response?.status()}`);

    let result;
    try {
      await vi.waitUntil(
        async () => {
          const contents = await page.evaluate(() => document.body.textContent);
          if (!contents) {
            return false;
          }
          result = JSON.parse(contents);
          return result.status === "success" || result.status === "error";
        },
        { timeout: 30_000, interval: 100 },
      );
    } catch (error) {
      const status = await page.evaluate(() => document.body.textContent);
      assert.fail([String(error), `page status: ${status}`, ...diagnostics].join("\n"));
    }

    const detail = [result.message, result.stack, ...result.logs, ...diagnostics]
      .filter(Boolean)
      .join("\n");
    if (browserCase.error) {
      assert.strictEqual(result.status, "error", detail);
      assert.include(detail, browserCase.error);
    } else {
      assert.strictEqual(result.status, "success", detail);
      if (browserCase.output) {
        assert.include(result.logs.join("\n"), browserCase.output);
      }
    }
  } finally {
    await page?.close();
    if (server) {
      await server.cleanup();
    } else {
      await rm(outputRoot, { recursive: true, force: true });
    }
  }
}
