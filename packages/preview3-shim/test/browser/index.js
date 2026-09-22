import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, assert, beforeAll, suite, test, vi } from "vitest";
import { transpile } from "@bytecodealliance/jco";

import { startTestServer } from "../../../preview2-shim/test/common.ts";

const FIXTURES = fileURLToPath(
  new URL("../../../jco-transpile/test/fixtures/components/p3/", import.meta.url),
);
const HARNESS = fileURLToPath(new URL("./fixtures/harness/", import.meta.url));

const CASES = [
  {
    title: "CLI stdout and post-return",
    fixture: "cli/p3-cli-hello-stdout-post-return.wasm",
    output: "Hello, world!",
  },
  {
    title: "monotonic clock wait",
    fixture: "clocks/p3-clocks-sleep.wasm",
  },
  {
    title: "secure and insecure random",
    fixture: "random/p3-random-imports.wasm",
  },
  {
    title: "component-exported closed stream",
    fixture: "streams/async-closed-stream.wasm",
    action: "closed-stream",
  },
  {
    title: "component stream and future inputs",
    fixture: "streams/async-closed-streams.wasm",
    action: "stream-future-inputs",
  },
  {
    title: "filesystem read/write",
    fixture: "fs/p3-filesystem-file-read-write.wasm",
  },
  {
    title: "OPFS component file read/write",
    fixture: "fs/p3-filesystem-file-read-write.wasm",
    action: "opfs-component",
    output: "OPFS component run completed",
  },
  {
    title: "OPFS component directory operations",
    fixture: "fs/p3-readdir.wasm",
    action: "opfs-component",
    output: "OPFS component run completed",
  },
  {
    title: "OPFS persistence and symlinks",
    fixture: "fs/p3-filesystem-file-read-write.wasm",
    action: "opfs-persistence",
    output: "OPFS persistence verified",
  },
  {
    title: "HTTP GET",
    fixture: "http/p3-http-outbound-request-get.wasm",
  },
  {
    title: "HTTP POST body",
    fixture: "http/p3-http-outbound-request-post.wasm",
  },
  {
    title: "HTTP invalid header error",
    fixture: "http/p3-http-outbound-request-invalid-header.wasm",
  },
  {
    title: "unsupported DNS reports a stable WASI error",
    fixture: "sockets/p3-sockets-ip-name-lookup.wasm",
    error: "not-supported",
  },
];

async function writeTranspiledFixture(root, fixture) {
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

suite("Preview 3 browser components", () => {
  let server;
  let outputRoot;
  const entries = new Map();

  beforeAll(async () => {
    outputRoot = await mkdtemp(join(process.cwd(), ".preview3-browser-"));
    try {
      for (const browserCase of CASES) {
        if (entries.has(browserCase.fixture)) {
          continue;
        }
        entries.set(
          browserCase.fixture,
          await writeTranspiledFixture(outputRoot, browserCase.fixture),
        );
      }
      server = await startTestServer({
        transpiledOutputDir: outputRoot,
        htmlDir: HARNESS,
      });
    } catch (error) {
      await rm(outputRoot, { recursive: true, force: true });
      throw error;
    }
  }, 180_000);

  afterAll(async () => {
    if (server) {
      await server.cleanup();
    } else if (outputRoot) {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  for (const browserCase of CASES) {
    test(
      browserCase.title,
      async () => {
        const page = await server.browser.newPage();
        const browserErrors = [];
        page.on("pageerror", (error) => browserErrors.push(error.stack ?? String(error)));
        try {
          const entry = entries.get(browserCase.fixture);
          const params = new URLSearchParams({ entry });
          if (browserCase.action) {
            params.set("action", browserCase.action);
          }
          await page.goto(`${server.baseURL}/index.html#${params}`);
          let result;
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
          assert.deepEqual(browserErrors, []);
          const detail = [result.message, result.stack, ...result.logs].filter(Boolean).join("\n");
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
          await page.close();
        }
      },
      45_000,
    );
  }
});
