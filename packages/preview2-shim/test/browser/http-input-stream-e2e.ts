import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { dirname, join } from "node:path";

import { componentize } from "@bytecodealliance/componentize-js";
import { transpile } from "@bytecodealliance/jco";
import { test } from "vitest";

import {
    FIXTURES_WIT_DIR,
    getTmpDir,
    runBasicHarnessPageTest,
    startTestServer,
} from "../common.js";

test("browser HTTP input stream crosses JSPI with delayed chunks and errors", async () => {
    let body: ServerResponse | undefined;
    let broken: ServerResponse | undefined;
    const requests: string[] = [];
    const api = createServer((request, response): void => {
        requests.push(request.url ?? "");
        response.setHeader("access-control-allow-origin", "*");
        if (request.url === "/body" || request.url === "/broken") {
            response.writeHead(200, { "content-type": "application/octet-stream" });
            response.flushHeaders();
            if (request.url === "/body") {
                body = response;
            } else {
                broken = response;
            }
            return;
        }
        // Explicit guest-controlled gates, not timers: headers must be available
        // before body bytes, and /second cannot arrive until the first chunk drains.
        switch (request.url) {
            case "/first":
                body?.write("abcd");
                break;
            case "/second":
                body?.write("ef");
                break;
            case "/finish":
                body?.end();
                break;
            case "/abort":
                broken?.destroy();
                break;
            default:
                response.writeHead(404).end();
                return;
        }
        response.writeHead(204).end();
    });
    await new Promise<void>((resolve, reject) => {
        api.once("error", reject);
        api.listen(0, "127.0.0.1", resolve);
    });
    let harness: Awaited<ReturnType<typeof startTestServer>> | undefined;
    try {
        const address = api.address();
        assert.ok(address && typeof address !== "string");
        const outDir = await getTmpDir();
        harness = await startTestServer({ transpiledOutputDir: outDir });
        const source = await readFile(
            new URL("../fixtures/browser/http-input-stream/component.js", import.meta.url),
            "utf8",
        );
        const sourcePath = join(outDir, "source.js");
        await writeFile(sourcePath, source.replace("TEST_AUTHORITY", `127.0.0.1:${address.port}`));
        const { component } = await componentize({
            sourcePath,
            witPath: FIXTURES_WIT_DIR,
            worldName: "browser-http-fetch",
        });
        const { files } = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            // read and skip deliberately remain synchronous, as the WASI contract
            // requires. Only polling and blocking operations may suspend.
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/poll#poll",
                "wasi:io/streams#[method]input-stream.blocking-read",
                "wasi:io/streams#[method]input-stream.blocking-skip",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [path, bytes] of Object.entries(files)) {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, bytes);
        }
        const { statusJSON } = await runBasicHarnessPageTest({
            browser: harness.browser,
            url: `${harness.baseURL}/index.html#transpiled:component.js`,
        });
        assert.strictEqual(statusJSON.status, "success");
        assert.strictEqual(
            statusJSON.msg,
            "empty reads, streaming, polling, EOF, and IO errors passed",
        );
        assert.deepStrictEqual(requests, [
            "/body",
            "/first",
            "/second",
            "/finish",
            "/broken",
            "/abort",
        ]);
    } finally {
        api.closeAllConnections();
        await Promise.all([
            harness?.cleanup(),
            new Promise<void>((resolve, reject) =>
                api.close((error) => (error ? reject(error) : resolve())),
            ),
        ]);
    }
}, 120_000);
