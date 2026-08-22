import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { env, execPath, version as nodeVersion } from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { getRandomPort, terminateServer, waitForServer } from "./server-helpers.js";

const JCO_JS_PATH = fileURLToPath(new URL("../../dist/jco.js", import.meta.url));
const HTTP_WIT_PATH = fileURLToPath(new URL("../fixtures/componentize/wasi-http-detection-new/wit", import.meta.url));

const requestCount = parsePositiveInteger(env.JCO_SERVE_BENCH_REQUESTS, 10_000);
const warmupCount = parsePositiveInteger(env.JCO_SERVE_BENCH_WARMUP, 100);

const modes = [
    { name: "native" },
    { name: "shared", option: undefined },
    { name: "instance", option: "--isolate-requests=instance" },
    {
        name: "worker (pool 1)",
        options: ["--isolate-requests=worker", "--isolate-worker-pool-size=1"],
    },
    {
        name: "worker (pool 50)",
        options: ["--isolate-requests=worker", "--isolate-worker-pool-size=50"],
    },
    {
        name: "worker (pool 100)",
        options: ["--isolate-requests=worker", "--isolate-worker-pool-size=100"],
    },
];

const tmpDir = await mkdtemp(join(tmpdir(), "jco-serve-bench-"));
try {
    const componentPath = env.JCO_SERVE_BENCH_COMPONENT
        ? resolve(env.JCO_SERVE_BENCH_COMPONENT)
        : await buildBenchmarkComponent(tmpDir);

    console.log(`Node: ${nodeVersion}`);
    console.log(`CPU: ${cpus()[0]?.model ?? "unknown"} (${cpus().length} logical CPUs)`);
    console.log(`Requests: ${requestCount} measured after ${warmupCount} warmups (sequential)`);
    console.log(`Component: ${componentPath}`);
    console.log();

    const results = [];
    for (const mode of modes) {
        results.push(
            mode.name === "native" ? await benchmarkNative() : await benchmarkMode(componentPath, mode, tmpDir),
        );
    }

    console.table(
        results.map(({ name, requestsPerSecond, mean, median, p95 }) => ({
            mode: name,
            "requests/s": requestsPerSecond.toFixed(2),
            "mean ms": mean.toFixed(2),
            "median ms": median.toFixed(2),
            "p95 ms": p95.toFixed(2),
        })),
    );
} finally {
    await rm(tmpDir, { recursive: true, force: true });
}

async function buildBenchmarkComponent(tmpDir) {
    const sourcePath = join(tmpDir, "serve-isolation-benchmark.js");
    const componentPath = env.JCO_SERVE_BENCH_COMPONENT_OUT
        ? resolve(env.JCO_SERVE_BENCH_COMPONENT_OUT)
        : join(tmpDir, "serve-isolation-benchmark.wasm");
    await writeFile(
        sourcePath,
        `
import { ResponseOutparam, OutgoingBody, OutgoingResponse, Fields } from "wasi:http/types@0.2.10";
const body = new TextEncoder().encode("ok");
export const incomingHandler = {
  handle(_request, responseOutparam) {
    const response = new OutgoingResponse(new Fields());
    const outgoingBody = response.body();
    const stream = outgoingBody.write();
    stream.blockingWriteAndFlush(body);
    stream[Symbol.dispose]();
    OutgoingBody.finish(outgoingBody, undefined);
    ResponseOutparam.set(responseOutparam, { tag: "ok", val: response });
  }
};
`,
    );
    console.error("Building benchmark component (set JCO_SERVE_BENCH_COMPONENT to reuse one)...");
    await runJco(["componentize", sourcePath, "-w", HTTP_WIT_PATH, "-o", componentPath]);
    return componentPath;
}

async function runJco(args) {
    const child = spawn(execPath, [JCO_JS_PATH, ...args], { stdio: ["ignore", "inherit", "inherit"] });
    const code = await new Promise((resolveExit, reject) => {
        child.once("error", reject);
        child.once("exit", resolveExit);
    });
    if (code !== 0) {
        throw new Error(`jco ${args[0]} exited with code ${code}`);
    }
}

async function benchmarkMode(componentPath, { name, option, options }, tmpDir) {
    const port = await getRandomPort();
    const outDir = join(tmpDir, `serve-${name.replaceAll(/[^a-z0-9]+/gi, "-")}`);
    const args = [
        JCO_JS_PATH,
        "serve",
        componentPath,
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--jco-dir",
        outDir,
    ];
    if (option) {
        args.push(option);
    }
    if (options) {
        args.push(...options);
    }
    const child = spawn(execPath, args, { detached: true, stdio: ["ignore", "ignore", "pipe"] });
    try {
        await waitForServer(child);
        return await measureRequests(name, port);
    } finally {
        await terminateServer(child);
        await rm(outDir, { recursive: true, force: true });
    }
}

async function benchmarkNative() {
    const port = await getRandomPort();
    const server = createServer((_request, response) => response.end("ok"));
    await new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolveListen);
    });
    try {
        return await measureRequests("native", port);
    } finally {
        await new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
    }
}

async function measureRequests(name, port) {
    for (let i = 0; i < warmupCount; i++) {
        await request(port);
    }
    const durations = [];
    const start = performance.now();
    for (let i = 0; i < requestCount; i++) {
        const requestStart = performance.now();
        await request(port);
        durations.push(performance.now() - requestStart);
    }
    const elapsed = performance.now() - start;
    durations.sort((a, b) => a - b);
    return {
        name,
        requestsPerSecond: (requestCount * 1000) / elapsed,
        mean: durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
        median: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
    };
}

async function request(port) {
    const response = await fetch(`http://127.0.0.1:${port}`);
    const body = await response.text();
    if (!response.ok || body !== "ok") {
        throw new Error(`unexpected response: ${response.status} ${JSON.stringify(body)}`);
    }
}

function percentile(sorted, quantile) {
    return sorted[Math.min(Math.ceil(sorted.length * quantile) - 1, sorted.length - 1)];
}

function parsePositiveInteger(value, fallback) {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`expected a positive integer, received ${JSON.stringify(value)}`);
    }
    return parsed;
}
