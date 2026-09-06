import { mkdir, writeFile } from "node:fs/promises";
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

        const { component } = await componentize(
            `
import { Fields, OutgoingRequest, OutgoingBody } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";

const dispose = Symbol.dispose || Symbol.for("dispose");

function fetchResponse(path) {
    const req = new OutgoingRequest(new Fields());
    req.setMethod({ tag: "get" });
    req.setScheme({ tag: "HTTP" });
    req.setAuthority("127.0.0.1:${address.port}");
    req.setPathWithQuery(path);
    OutgoingBody.finish(req.body(), undefined);
    const future = handle(req, undefined);
    const ready = future.subscribe();
    ready.block();
    ready[dispose]();
    const result = future.get();
    if (!result || result.tag !== "ok" || result.val.tag !== "ok") {
        throw "request failed: " + JSON.stringify(result);
    }
    const response = result.val.val;
    // Exercise the component's canonical resource-drop path, not a host-side
    // prototype spy. Response headers are ready but the body is still live.
    future[dispose]();
    return response;
}

export const test = {
    run() {
        const response = fetchResponse("/stream");
        if (response.status() !== 200) throw "expected 200";
        const body = response.consume();
        response[dispose]();
        const stream = body.stream();

        const released = fetchResponse("/release");
        if (released.status() !== 204) throw "expected 204";
        released[dispose]();

        let text = "";
        try {
            for (;;) {
                text += new TextDecoder().decode(stream.blockingRead(64n));
            }
        } catch (err) {
            const error = err.payload || err;
            if (error.tag !== "closed") throw "body read failed: " + JSON.stringify(error);
        } finally {
            stream[dispose]();
            body[dispose]();
        }
        if (text !== "before disposal; after disposal") throw "incomplete body: " + text;
        return text;
    }
}
`,
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
