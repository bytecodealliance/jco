import { fileURLToPath, URL } from "node:url";
import { join, normalize, sep } from "node:path";
import { readdir, stat, mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { debuglog } from "node:util";

import { suite, test, assert } from "vitest";
import { default as which } from "which";
import { componentize } from "@bytecodealliance/componentize-js";

import { rolldown } from "rolldown";

const FIXTURE_APPS_DIR = fileURLToPath(new URL("../fixtures/apps", import.meta.url));

const JCO_STD_DIR = fileURLToPath(new URL("../../", import.meta.url));

/** Get the binary path to wasmtime if it doesn't exist */
async function getWasmtimeBin(env?: Record<string, string>): Promise<string> {
    try {
        return env?.TEST_WASMTIME_BIN ?? await which('wasmtime');
    } catch (err) {
        console.error("missing wasmtime binary, set TEST_WASMTIME_BIN or ensure wasmtime is in your PATH");
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
 * npm run build && npm run test
 * ```
 */
const log = debuglog("test-e2e");

suite("hono apps", async () => {
    const tmpdir = await getTmpDir();
    const builtComponentDir = join(tmpdir, "built-components");
    await mkdir(builtComponentDir, { recursive: true });
    log("writing component output to dir", builtComponentDir);

    // Run tests for all app.js scripts at ./fixtures/apps/*/app.js
    const dirs = await readdir(FIXTURE_APPS_DIR, { withFileTypes: true });
    for (const appDir of dirs) {
        // Get the script path, skip the folder if it doesn't
        if (!appDir.isDirectory()) { continue; }
        const fixtureDir = join(FIXTURE_APPS_DIR, appDir.name);
        const sourcePath = join(fixtureDir, "app.js");
        const scriptExists = await (stat(sourcePath).then(() => true).catch(() => false));

        // If the folder doesn't have an app script, we can quit early
        if (!scriptExists) { continue; }

        const appFolderName = appDir.name;

        // Load the test script, and pull configuration out, if present
        const testScriptPath = join(fixtureDir, "test.js");
        const testMod = await import(testScriptPath);
        const wasmtimeExtraArgs = testMod.config?.wasmtime?.extraArgs ? testMod.config?.wasmtime?.extraArgs() : [];

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

        test(`[${appFolderName}]`, { retry: 3 }, async () => {
            log(`testing app [${appFolderName}]`);

            // Bundle the application w/ deps via rolldown
            const bundle = await rolldown({
                input: sourcePath,
                external: [
                    /^wasi:.*/,
                ],
                resolve: {
                    alias: {
                        '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono': join(JCO_STD_DIR, "dist/0.2.3/http/adapters/hono.js"),
                        '@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono': join(JCO_STD_DIR, "dist/0.2.6/http/adapters/hono.js"),
                    }
                }
            });
            await bundle.write({
                file: jsOutputPath,
                format: 'esm',
            });

            const componentJS = await readFile(jsOutputPath, 'utf8');

            // Build the component with componentize-js
            const opts = {
                witPath,
                worldName: witWorldName,
            };

            const { component } = await componentize(componentJS, opts);

            // Write out the component to a file
            const componentOutputPath = join(componentOutputDir, "component.wasm");
            await writeFile(componentOutputPath, component);

            // Serve with wasmtime?
            const wasmtime = spawn(
                wasmtimeBin,
                [
                    "serve",
                    "-S",
                    "config,cli",
                    "--addr", "127.0.0.1:0",
                    ...wasmtimeExtraArgs,
                    componentOutputPath,
                ]
            );
            process.on('exit', () => {
                if (wasmtime && !wasmtime.killed) {
                    wasmtime.kill();
                }
            })

            // Wait for wasmtime to start serving the component
            const { promise: startupWait, resolve: resolveStartupWait } = Promise.withResolvers();
            wasmtime.stderr.on('data', data => {
                log(`[wasmtime] STDERR: ${data}`);
                if (data.includes("a matching implementation was not found in the linker")) {
                    console.error([
                        "Do you have a version of wasmtime with the right interfaces?",
                        "Consider installing the following version of wasmtime locally:",
                        "    cargo install \\",
                        "        --git https://github.com/bytecodealliance/wasmtime \\",
                        "        --rev 29f2a1ca66c849a2d2e533a2df87c221daa8e2de \\",
                        "        wasmtime-cli",
                    ].join("\n"));
                    assert.fail(`unexpected error while running wasmtime: ${data}]`);
                }

                if (data.includes("127.0.0.1")) {
                    resolveStartupWait(data);
                }
            });
            wasmtime.stdout.on('data', data => {
                log(`[wasmtime] STDOUT: ${data}`);
                if (data.includes("127.0.0.1")) {
                    resolveStartupWait(data);
                }
            });

            // Wait for startup
            const ipLine = await startupWait;

            // Parse out wasmtime's randomly chosen port
            const matches = /(127\.0\.0\.1):(\d+)/.exec(ipLine);
            if (!matches) { throw new Error("failed to match IP address regex"); }
            const host = matches[1];
            const port = parseInt(matches[2]);
            const url = `http://${host}:${port}`;

            // Run the test that is co-located with the fixture app in question
            await testMod.test({ server: { host, port, url } });

            wasmtime.kill();
        });
    }

})
