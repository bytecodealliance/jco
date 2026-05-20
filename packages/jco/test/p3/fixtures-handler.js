import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, beforeAll, afterAll } from "vitest";

import { P3_COMPONENT_FIXTURES_DIR } from "../common.js";
import { setupAsyncTest } from "../helpers.js";
import { runHandlerFixture } from "./handler-runner.js";

const P3_HANDLER_FIXTURE_OUTPUT_DIR = fileURLToPath(new URL("../output/p3-handler-fixtures", import.meta.url));

const REQUEST = {
    headers: { foo: "bar" },
    body: "And the mome raths outgrabe",
    trailers: { fizz: "buzz" },
};

function withExtraHeaders(payload, headers) {
    return { ...payload, headers: { ...payload.headers, ...headers } };
}

const P3_HANDLER_RUN_FIXTURES = [
    {
        path: "http/p3-http-echo.wasm",
        outbound: REQUEST,
        expect: REQUEST,
    },
    {
        path: "http/p3-http-echo.wasm",
        title: "host-to-host",
        outbound: withExtraHeaders(REQUEST, { "x-host-to-host": "true" }),
        expect: REQUEST,
    },
    {
        path: "http/p3-api-proxy.wasm",
        expect: { body: "hello, world!" },
    },
    {
        path: "cli/p3-cli-serve-hello-world.wasm",
        expect: { body: "Hello, WASI!" },
    },
    // TODO(tandr): cli/p3-cli-serve-sleep.wasm
    // TODO(tandr): http/p3-http-middleware.wasm
    // TODO(tandr): http/p3-http-middleware-with-chain.wasm
    // TODO(tandr): http/p3-http-proxy.wasm
];

function outputDirFor(fixture) {
    const { path: relPath, title } = fixture;
    const base = relPath.replace(/[/\\]/g, "__").replace(/\.wasm$/, "");
    return title ? `${base}__${title.replace(/[^A-Za-z0-9_-]/g, "-")}` : base;
}

async function setupFixture(fixture) {
    const { path: relPath } = fixture;
    const outputDir = join(P3_HANDLER_FIXTURE_OUTPUT_DIR, outputDirFor(fixture));

    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

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
                        asyncExports: ["wasi:http/handler#handle"],
                    },
                },
            },
        });
        cleanup = setup.cleanup;

        return { esModule: setup.esModule, cleanup };
    } catch (err) {
        await cleanup?.();
        throw err;
    }
}

suite("P3 handler fixtures", () => {
    for (const fixture of P3_HANDLER_RUN_FIXTURES) {
        const { path: relPath, title, failing, outbound, expect } = fixture;
        const labelBase = title ? `${relPath} (${title})` : relPath;
        const heading = `invoke ${labelBase}${failing ? " (currently failing)" : ""}`;

        suite.skipIf(failing)(heading, () => {
            let esModule;
            let cleanup;

            beforeAll(async () => {
                ({ esModule, cleanup } = await setupFixture(fixture));
            });

            afterAll(async () => {
                await cleanup?.();
            });

            test("passes", async () => {
                await runHandlerFixture({ esModule, outbound, expect });
            });
        });
    }
});
