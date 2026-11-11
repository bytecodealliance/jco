import { fileURLToPath, URL } from "node:url";
import { join, normalize, sep } from "node:path";
import { readdir, stat, mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { debuglog } from "node:util";

import { suite, test, afterAll } from "vitest";
import { default as which } from "which";
// NOTE: we must use the older version of componentize-js for components with
// `wasi:http` < v0.2.10
import { componentizeLegacy as componentize } from "./helpers/componentize.js";

import { rolldown } from "rolldown";

/** Path to fixture app directory */
const FIXTURE_APPS_DIR = fileURLToPath(new URL("../fixtures/apps", import.meta.url));

/** Path to jco-std directory */
const JCO_STD_DIR = fileURLToPath(new URL("../../", import.meta.url));

/** Resolver configuration that can be used with rolldown when building test components */
const TEST_RESOLVER_CONFIG = {
  alias: {
    "@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono/server": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.3/http/adapters/hono/server.js",
    ),
    "@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono/middleware/env": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.3/http/adapters/hono/middleware/env.js",
    ),
    "@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono/middleware/config": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.3/http/adapters/hono/middleware/config.js",
    ),
    "@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono/server": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.6/http/adapters/hono/server.js",
    ),
    "@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono/middleware/env": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.6/http/adapters/hono/middleware/env.js",
    ),
    "@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono/middleware/config": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.6/http/adapters/hono/middleware/config.js",
    ),
    "@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.6/http/adapters/hono/server.js",
    ),
    "@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/middleware/env": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.6/http/adapters/hono/middleware/env.js",
    ),
    "@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/middleware/config": join(
      JCO_STD_DIR,
      "dist/wasi/0.2.6/http/adapters/hono/middleware/config.js",
    ),
  },
};

/** Resolve an explicit Wasmtime override before searching PATH. */
async function getWasmtimeBin(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  try {
    return env.TEST_WASMTIME_BIN ?? (await which("wasmtime"));
  } catch (err) {
    console.error(
      "missing wasmtime binary, set TEST_WASMTIME_BIN or ensure wasmtime is in your PATH",
    );
    throw err;
  }
}

/**
 * Securely creates a temporary directory and returns its path.
 *
 * The new directory is created using `fsPromises.mkdtemp()`.
 */
export async function getTmpDir() {
  return await mkdtemp(normalize(tmpdir() + sep));
}

/**
 * To enable debug logging:
 *
 * ```
 * export NODE_DEBUG=test-e2e
 * pnpm run build && pnpm run test
 * ```
 */
const log = debuglog("test-e2e");

suite("hono apps", async () => {
  const tmpdir = await getTmpDir();
  afterAll(() => rm(tmpdir, { recursive: true, force: true }));
  const builtComponentDir = join(tmpdir, "built-components");
  await mkdir(builtComponentDir, { recursive: true });
  log("writing component output to dir", builtComponentDir);

  // Run tests for all app.js scripts at ./fixtures/apps/*/app.js
  const dirs = await readdir(FIXTURE_APPS_DIR, { withFileTypes: true });
  for (const appDir of dirs) {
    // Get the script path, skip the folder if it doesn't
    if (!appDir.isDirectory()) {
      continue;
    }
    const fixtureDir = join(FIXTURE_APPS_DIR, appDir.name);
    const sourcePath = join(fixtureDir, "app.js");
    const scriptExists = await stat(sourcePath)
      .then(() => true)
      .catch(() => false);

    // If the folder doesn't have an app script, we can quit early
    if (!scriptExists) {
      continue;
    }

    const appFolderName = appDir.name;

    // Load the test script, and pull configuration out, if present
    const testScriptPath = join(fixtureDir, "test.js");
    const testMod = await import(testScriptPath);
    const wasmtimeExtraArgs = testMod.config?.wasmtime?.extraArgs
      ? testMod.config?.wasmtime?.extraArgs()
      : [];

    const witWorldName = testMod.config?.wit?.world;
    if (!witWorldName) {
      throw new Error(`wit world missing fromtest script 'config' export [${testScriptPath}]`);
    }

    // Get the WIT path & world for the given test
    const witPath = join(FIXTURE_APPS_DIR, "wit", witWorldName);

    // Create an output dir for building the component
    const componentOutputDir = join(builtComponentDir, appFolderName);
    await mkdir(componentOutputDir, { recursive: true });

    const jsOutputPath = join(componentOutputDir, "component.js");

    // Get wasmtime dir path, ensure it exists
    const wasmtimeBin = await getWasmtimeBin();

    test(`[${appFolderName}]`, async () => {
      log(`testing app [${appFolderName}]`);

      // Bundle the application w/ deps via rolldown
      const bundle = await rolldown({
        input: sourcePath,
        external: [/^wasi:.*/],
        resolve: TEST_RESOLVER_CONFIG,
      });
      await bundle.write({
        file: jsOutputPath,
        format: "esm",
      });

      const componentJS = await readFile(jsOutputPath, "utf8");

      // Build the component with componentize-js
      const opts = {
        witPath,
        worldName: witWorldName,
      };

      const { component } = await componentize(componentJS, opts);

      // Write out the component to a file
      const componentOutputPath = join(componentOutputDir, "component.wasm");
      await writeFile(componentOutputPath, component);

      const wasmtime = spawn(wasmtimeBin, [
        "serve",
        "-S",
        "config,cli",
        "--addr",
        "127.0.0.1:0",
        ...wasmtimeExtraArgs,
        componentOutputPath,
      ]);
      const stop = () => wasmtime.kill();
      process.once("exit", stop);
      let output = "";
      let startupTimer: ReturnType<typeof setTimeout> | undefined;
      let requestTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const { host, port } = await new Promise<{ host: string; port: number }>(
          (resolve, reject) => {
            const observe = (chunk: Buffer) => {
              output += chunk.toString();
              log(`[wasmtime] ${chunk}`);
              const match = /(127\.0\.0\.1):(\d+)(?:\/|\s)/.exec(output);
              if (match) {
                resolve({ host: match[1], port: Number(match[2]) });
              }
            };
            wasmtime.stdout.on("data", observe);
            wasmtime.stderr.on("data", observe);
            wasmtime.once("error", reject);
            wasmtime.once("exit", (code, signal) =>
              reject(new Error(`Wasmtime exited before listening (${code ?? signal}): ${output}`)),
            );
            startupTimer = setTimeout(
              () => reject(new Error(`Wasmtime startup timed out: ${output}`)),
              30_000,
            );
          },
        );
        clearTimeout(startupTimer);
        await Promise.race([
          testMod.test({ server: { host, port, url: `http://${host}:${port}` } }),
          new Promise<never>((_resolve, reject) => {
            requestTimer = setTimeout(
              () => reject(new Error(`HTTP fixture timed out: ${output}`)),
              30_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(startupTimer);
        clearTimeout(requestTimer);
        process.off("exit", stop);
        if (
          wasmtime.pid !== undefined &&
          wasmtime.exitCode === null &&
          wasmtime.signalCode === null
        ) {
          const closed = new Promise<void>((resolve) => wasmtime.once("close", () => resolve()));
          stop();
          await closed;
        }
        await rm(componentOutputDir, { recursive: true, force: true });
      }
    });
  }
});
