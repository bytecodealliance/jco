import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";

import { componentize, type ComponentizeOptions } from "@bytecodealliance/componentize-js";
import { transpile } from "@bytecodealliance/jco";
import { assert, test } from "vitest";

import {
    FIXTURES_WIT_DIR,
    getTmpDir,
    runBasicHarnessPageTest,
    startTestServer,
} from "../common.js";

test("a component can drop its HTTP future before finishing a streamed body", async () => {
    const outDir = await getTmpDir();
    const { baseURL, browser, cleanup } = await startTestServer({
        transpiledOutputDir: outDir,
    });
    const releaseBody = Promise.withResolvers<void>();
    let streamStarted = false;
    let releaseRequested = false;
    const server = createServer((req, res) => {
        res.setHeader("access-control-allow-origin", "*");
        if (req.url === "/stream") {
            streamStarted = true;
            res.writeHead(200, { "content-type": "text/plain" });
            res.write("before disposal; ");
            // No timers: the final bytes do not exist on the wire until the
            // component has explicitly dropped its future and requested them.
            void releaseBody.promise.then(() => res.end("after disposal"));
        } else if (req.url === "/release") {
            releaseRequested = true;
            releaseBody.resolve();
            res.writeHead(204);
            res.end();
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    try {
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        if (!address || typeof address === "string") {
            throw new Error("missing streaming server address");
        }

        const source = await readFile(
            new URL("../fixtures/browser/http-future/component.js", import.meta.url),
            "utf8",
        );
        const { component } = await componentize(
            source.replace("{{SERVER_AUTHORITY}}", `127.0.0.1:${address.port}`),
            { witPath: FIXTURES_WIT_DIR, worldName: "browser-http-fetch" } as ComponentizeOptions,
        );
        const { files } = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/streams#[method]input-stream.blocking-read",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [path, contents] of Object.entries(files)) {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, contents);
        }
        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });
        assert.strictEqual(statusJSON.msg, "before disposal; after disposal");
        assert.strictEqual(streamStarted, true);
        assert.strictEqual(releaseRequested, true);
    } finally {
        releaseBody.resolve();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        await cleanup();
    }
}, 120_000);
