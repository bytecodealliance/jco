import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { env as processEnv, execArgv, execPath } from "node:process";
import { fileURLToPath } from "node:url";

import { suite, test, assert, beforeAll, afterAll } from "vitest";

import { P3_COMPONENT_FIXTURES_DIR } from "../common.js";
import { setupAsyncTest } from "../helpers.js";

const P3_CLI_FIXTURE_OUTPUT_DIR = fileURLToPath(new URL("../output/p3-cli-fixtures", import.meta.url));
const CLI_RUNNER_PATH = fileURLToPath(new URL("./cli-runner.js", import.meta.url));

const RUN_TIMEOUT_MS = 15_000;

const P3_CLI_RUN_FIXTURES = [
    { path: "cli/p3-cli-hello-stdout-post-return.wasm" },
    { path: "cli/p3-cli-hello-stdout.wasm" },
    { path: "cli/p3-cli-much-stdout.wasm", args: ["p3_cli_much_stdout.component", "hello, world\n", "1"] },
    { path: "cli/p3-cli.wasm", args: ["p3_cli.component", "."] },
    { path: "clocks/p3-clocks-sleep.wasm" },
    { path: "fs/p3-file-write.wasm" },
    { path: "fs/p3-filesystem-file-read-write.wasm" },
    { path: "fs/p3-readdir.wasm" },
    { path: "http/p3-http-outbound-request-get.wasm" },
    { path: "http/p3-http-outbound-request-invalid-dnsname.wasm" },
    { path: "http/p3-http-outbound-request-invalid-header.wasm" },
    { path: "http/p3-http-outbound-request-invalid-port.wasm" },
    { path: "http/p3-http-outbound-request-invalid-version.wasm" },
    { path: "http/p3-http-outbound-request-missing-path-and-query.wasm" },
    { path: "http/p3-http-outbound-request-post.wasm" },
    { path: "http/p3-http-outbound-request-put.wasm" },
    { path: "http/p3-http-outbound-request-timeout.wasm" },
    { path: "http/p3-http-outbound-request-unknown-method.wasm" },
    { path: "http/p3-http-outbound-request-unsupported-scheme.wasm" },
    { path: "random/p3-random-imports.wasm" },
    { path: "sockets/p3-sockets-ip-name-lookup.wasm" },
    { path: "sockets/p3-sockets-tcp-bind.wasm" },
    { path: "sockets/p3-sockets-tcp-connect.wasm" },
    { path: "sockets/p3-sockets-tcp-listen.wasm" },
    { path: "sockets/p3-sockets-tcp-sample-application.wasm" },
    { path: "sockets/p3-sockets-tcp-sockopts.wasm" },
    { path: "sockets/p3-sockets-tcp-states.wasm" },
    { path: "sockets/p3-sockets-udp-bind.wasm" },
    { path: "sockets/p3-sockets-udp-connect.wasm" },
    { path: "sockets/p3-sockets-udp-receive.wasm" },
    { path: "sockets/p3-sockets-udp-sample-application.wasm" },
    { path: "sockets/p3-sockets-udp-send.wasm" },
    { path: "sockets/p3-sockets-udp-sockopts.wasm" },
    { path: "sockets/p3-sockets-udp-states.wasm" },
    // currently failing
    { path: "http/p3-http-outbound-request-content-length.wasm", failing: true },
    { path: "http/p3-http-outbound-request-large-post.wasm", failing: true },
    { path: "http/p3-http-outbound-request-response-build.wasm", failing: true },
    { path: "sockets/p3-sockets-tcp-streams.wasm", failing: true },
];

function outputDirFor(fixture) {
    return fixture.path.replace(/[/\\]/g, "__").replace(/\.wasm$/, "");
}

async function startServer() {
    const server = createServer((req, res) => {
        const headers = {
            "content-type": "application/octet-stream",
            "x-wasmtime-test-method": req.method,
            "x-wasmtime-test-uri": req.url,
        };

        if (req.headers["content-length"]) {
            headers["content-length"] = req.headers["content-length"];
        }

        res.writeHead(200, headers);
        res.flushHeaders();
        req.pipe(res);
    });

    server.on("connect", (_req, socket) => socket.destroy());

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    const { address, port } = server.address();

    return {
        address: `${address}:${port}`,
        cleanup: () =>
            new Promise((resolve, reject) => {
                server.closeAllConnections?.();
                server.close((err) => (err ? reject(err) : resolve()));
            }),
    };
}

async function runNodeScript(scriptPath, scriptArgs, env = {}) {
    const args = [...execArgv, scriptPath, ...scriptArgs];
    if (!("Suspending" in WebAssembly) && !execArgv.includes("--experimental-wasm-jspi")) {
        args.unshift("--experimental-wasm-jspi");
    }

    // Vitest already runs this file in a forked worker; spawn each CLI fixture
    // in a fresh process so stdin, stdout/stderr, hangs, and process.exit stay contained.
    const child = spawn(execPath, args, { stdio: "pipe", env: { ...processEnv, ...env } });
    child.stdin.end();

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));

    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    try {
        const [code] = await once(child, "exit");
        return { code, stdout, stderr };
    } finally {
        clearTimeout(timer);
    }
}

async function setupFixture(fixture) {
    const { path: relPath, args } = fixture;
    const outputDir = join(P3_CLI_FIXTURE_OUTPUT_DIR, outputDirFor(fixture));
    const preopenDir = join(outputDir, "preopen");
    const runnerArgs = args ?? [basename(relPath, ".wasm")];

    await rm(outputDir, { recursive: true, force: true });
    await mkdir(preopenDir, { recursive: true });

    let cleanup;
    try {
        const setup = await setupAsyncTest({
            asyncMode: "jspi",
            component: {
                path: join(P3_COMPONENT_FIXTURES_DIR, relPath),
                outputDir,
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        instantiation: null,
                        asyncExports: ["wasi:cli/run#run"],
                    },
                },
            },
        });
        cleanup = setup.cleanup;

        return {
            esModuleHref: setup.esModuleSourcePathURL.href,
            preopenDir,
            runnerArgs,
            cleanup,
        };
    } catch (err) {
        await cleanup?.();
        throw err;
    }
}

suite("P3 CLI fixtures", () => {
    let server;

    beforeAll(async () => {
        server = await startServer();
    });

    afterAll(async () => {
        await server?.cleanup();
    });

    for (const fixture of P3_CLI_RUN_FIXTURES) {
        const { path: relPath, failing } = fixture;
        const title = `run ${relPath}${failing ? " (currently failing)" : ""}`;

        suite.skipIf(failing)(title, () => {
            let esModuleHref;
            let preopenDir;
            let runnerArgs;
            let cleanup;

            beforeAll(async () => {
                ({ esModuleHref, preopenDir, runnerArgs, cleanup } = await setupFixture(fixture));
            });

            afterAll(async () => {
                await cleanup?.();
            });

            test("passes", async () => {
                const { code, stdout, stderr } = await runNodeScript(
                    CLI_RUNNER_PATH,
                    [esModuleHref, preopenDir, JSON.stringify(runnerArgs)],
                    { HTTP_SERVER: server.address },
                );
                assert.strictEqual(code, 0, `fixture ${relPath} failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
            });
        });
    }
});
