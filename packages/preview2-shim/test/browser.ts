import { rejects, throws } from "node:assert";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createSecureServer } from "node:http2";
import { dirname } from "node:path";

import { suite, test, assert } from "vitest";
import { componentize, ComponentizeOptions } from "@bytecodealliance/componentize-js";
import { transpile } from "@bytecodealliance/jco";

import { getTmpDir, FIXTURES_WIT_DIR, startTestServer, runBasicHarnessPageTest } from "./common.js";

type TranspileOutput = { files: { [filename: string]: Uint8Array } };
const symbolDispose = Symbol.dispose || Symbol.for("dispose");
const LOCALHOST_KEY = new URL("./fixtures/tls/localhost.key", import.meta.url);
const LOCALHOST_CERTIFICATE = new URL("./fixtures/tls/localhost.crt", import.meta.url);

suite("browser", () => {
    test("native-fetch", async () => {
        const outDir = await getTmpDir();

        const { baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        const page = await browser.newPage();
        await page.goto(`${baseURL}/index.html`);

        const result = await page.evaluate(async () => {
            const res = await fetch("/api/test-echo");
            return {
                status: res.status,
                text: await res.clone().text(),
                json: await res.clone().json(),
            };
        });

        assert.strictEqual(result.status, 200);
        assert.strictEqual(typeof result.text, "string");
        assert.ok(result.text.includes("hello from test server"));
        assert.strictEqual(result.json.message, "hello from test server");

        await page.close();
        await cleanup();
    });

    test("native-fetch-request-streaming", async () => {
        const outDir = await getTmpDir();
        const streamingServer = createSecureServer({
            key: await readFile(LOCALHOST_KEY),
            cert: await readFile(LOCALHOST_CERTIFICATE),
        });
        streamingServer.on("stream", (stream, headers) => {
            if (headers[":method"] === "OPTIONS") {
                stream.respond({
                    ":status": 204,
                    "access-control-allow-origin": "*",
                    "access-control-allow-methods": "POST, OPTIONS",
                    "access-control-allow-headers": "*",
                });
                stream.end();
                return;
            }
            const chunks: Uint8Array[] = [];
            stream.on("data", (chunk) => chunks.push(chunk));
            stream.on("end", () => {
                stream.respond({
                    ":status": 200,
                    "content-type": "application/octet-stream",
                    "access-control-allow-origin": "*",
                });
                stream.end(Buffer.concat(chunks));
            });
        });
        await new Promise<void>((resolve) => streamingServer.listen(0, "localhost", resolve));
        const address = streamingServer.address();
        if (!address || typeof address === "string") {
            throw new Error("unexpected HTTP/2 server address");
        }
        const { baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        const page = await browser.newPage();
        await page.goto(`${baseURL}/index.html`);
        const result = await page.evaluate(async (serverPort) => {
            const http = (
                globalThis as typeof globalThis & {
                    preview2ShimHttp: typeof import("../src/browser/http.js");
                }
            ).preview2ShimHttp;
            http._setRequestStreaming(true);
            try {
                const request = new http.types.OutgoingRequest(new http.types.Fields());
                request.setMethod({ tag: "post" });
                request.setScheme({ tag: "HTTPS" });
                request.setAuthority(`localhost:${serverPort}`);
                request.setPathWithQuery("/post");
                const body = request.body();
                const stream = body.write();
                stream.checkWrite();
                stream.write(new TextEncoder().encode("before "));

                const responseFuture = http.outgoingHandler.handle(request, undefined);
                await Promise.resolve();
                stream.checkWrite();
                stream.write(new TextEncoder().encode("after"));
                http.types.OutgoingBody.finish(body, undefined);

                await responseFuture.subscribe().block();
                const result = responseFuture.get();
                if (!result || result.tag === "err" || result.val.tag === "err") {
                    throw new Error(`streaming request failed: ${JSON.stringify(result)}`);
                }
                const response = result.val.val;
                const incoming = response.consume();
                const input = incoming.stream();
                const chunks: Uint8Array[] = [];
                try {
                    while (true) {
                        chunks.push(await input.blockingRead(65_536n));
                    }
                } catch (error) {
                    if ((error as { tag?: string }).tag !== "closed") {
                        throw error;
                    }
                }
                const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
                const bytes = new Uint8Array(length);
                let offset = 0;
                for (const chunk of chunks) {
                    bytes.set(chunk, offset);
                    offset += chunk.byteLength;
                }
                return {
                    status: response.status(),
                    body: new TextDecoder().decode(bytes),
                };
            } finally {
                http._setRequestStreaming(false);
            }
        }, address.port);

        assert.deepStrictEqual(result, { status: 200, body: "before after" });
        await page.close();
        await new Promise<void>((resolve) => streamingServer.close(() => resolve()));
        await cleanup();
    });

    test("http-fetch", async () => {
        const outDir = await getTmpDir();

        // Start the server first to get the port (outDir exists but is empty;
        // files are served dynamically so we can write them after)
        const { port, baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        // Build a component that makes an HTTP request using WASI HTTP
        const { component } = await componentize(
            `
import { Fields } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";
import { OutgoingRequest, OutgoingBody, IncomingBody } from "wasi:http/types@0.2.8";

export const test = {
    run() {
        const headers = Fields.fromList([]);
        const req = new OutgoingRequest(headers);
        req.setMethod({ tag: "get" });
        req.setScheme({ tag: "HTTP" });
        req.setAuthority("localhost:${port}");
        req.setPathWithQuery("/api/test-echo");

        const outBody = req.body();
        OutgoingBody.finish(outBody, undefined);

        const future = handle(req, undefined);

        const pollable = future.subscribe();
        pollable.block();

        const result = future.get();
        if (!result) { throw "ERROR: no result from future"; }
        if (result.tag === "err") { throw "ERROR: future error: " + JSON.stringify(result); }
        if (result.val.tag === "err") { throw "ERROR: HTTP error: " + JSON.stringify(result.val.val); }

        const response = result.val.val;
        const status = response.status();
        if (status !== 200) { throw "ERROR: expected 200, got " + status; }

        const incomingBody = response.consume();
        const stream = incomingBody.stream();

        let bodyBytes = new Uint8Array(0);
        try {
            while (true) {
                const pollable = stream.subscribe();
                pollable.block();
                const chunk = stream.read(65536n);
                const merged = new Uint8Array(bodyBytes.length + chunk.length);
                merged.set(bodyBytes);
                merged.set(chunk, bodyBytes.length);
                bodyBytes = merged;
            }
        } catch (e) {
            const tag = e.tag || (e.payload && e.payload.tag);
            if (tag !== "closed") { throw "ERROR: stream error: " + JSON.stringify(e); }
        }

        const bodyText = new TextDecoder().decode(bodyBytes);

        const futureTrailers = IncomingBody.finish(incomingBody);
        const trailersPollable = futureTrailers.subscribe();
        if (!trailersPollable.ready()) { throw "ERROR: trailers future was not ready"; }

        const trailersResult = futureTrailers.get();
        if (!trailersResult || trailersResult.tag !== "ok" || trailersResult.val.tag !== "ok") {
            throw "ERROR: trailers future failed: " + JSON.stringify(trailersResult);
        }
        const trailers = trailersResult.val.val;
        if (!trailers || trailers.entries().length !== 0) {
            throw "ERROR: expected present, empty trailers";
        }
        let immutable = false;
        try {
            trailers.append("x-test", new TextEncoder().encode("value"));
        } catch (e) {
            immutable = e.tag === "immutable" || (e.payload && e.payload.tag === "immutable");
        }
        if (!immutable) { throw "ERROR: trailers must be immutable"; }

        const secondGet = futureTrailers.get();
        if (!secondGet || secondGet.tag !== "err") {
            throw "ERROR: trailers future must only be consumed once";
        }

        return bodyText;
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-http-fetch",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/poll#poll",
                "wasi:io/streams#[method]input-stream.blocking-read",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("hello from test server"));

        await cleanup();
    }, 120_000);

    test("http-fetch-with-options", async () => {
        const outDir = await getTmpDir();

        const { port, baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        const { component } = await componentize(
            `
import { Fields, RequestOptions } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";
import { OutgoingRequest, OutgoingBody, IncomingBody } from "wasi:http/types@0.2.8";

export const test = {
    run() {
        const headers = Fields.fromList([]);
        const req = new OutgoingRequest(headers);
        req.setMethod({ tag: "get" });
        req.setScheme({ tag: "HTTP" });
        req.setAuthority("localhost:${port}");
        req.setPathWithQuery("/api/test-echo");

        const outBody = req.body();
        OutgoingBody.finish(outBody, undefined);

        const options = new RequestOptions();
        options.setConnectTimeout(30000000000n);
        options.setFirstByteTimeout(30000000000n);
        options.setBetweenBytesTimeout(30000000000n);

        const future = handle(req, options);

        const pollable = future.subscribe();
        pollable.block();

        const result = future.get();
        if (!result) { throw "ERROR: no result from future"; }
        if (result.tag === "err") { throw "ERROR: future error: " + JSON.stringify(result); }
        if (result.val.tag === "err") { throw "ERROR: HTTP error: " + JSON.stringify(result.val.val); }

        const response = result.val.val;
        const status = response.status();
        if (status !== 200) { throw "ERROR: expected 200, got " + status; }

        const incomingBody = response.consume();
        const stream = incomingBody.stream();

        let bodyBytes = new Uint8Array(0);
        try {
            while (true) {
                const pollable = stream.subscribe();
                pollable.block();
                const chunk = stream.read(65536n);
                const merged = new Uint8Array(bodyBytes.length + chunk.length);
                merged.set(bodyBytes);
                merged.set(chunk, bodyBytes.length);
                bodyBytes = merged;
            }
        } catch (e) {
            const tag = e.tag || (e.payload && e.payload.tag);
            if (tag !== "closed") { throw "ERROR: stream error: " + JSON.stringify(e); }
        }

        const bodyText = new TextDecoder().decode(bodyBytes);
        return bodyText;
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-http-fetch",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/poll#poll",
                "wasi:io/streams#[method]input-stream.blocking-read",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("hello from test server"));

        await cleanup();
    }, 120_000);

    test("http-poll-fetch", async () => {
        const outDir = await getTmpDir();

        const { port, baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        // This component mimics the wstd reactor pattern:
        // poll with subscribe-duration(0) in a loop until future.get() returns
        const { component } = await componentize(
            `
import { Fields } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";
import { OutgoingRequest, OutgoingBody, IncomingBody } from "wasi:http/types@0.2.8";
import { subscribeDuration } from "wasi:clocks/monotonic-clock@0.2.8";
import { poll } from "wasi:io/poll@0.2.8";

export const test = {
    run() {
        const headers = Fields.fromList([]);
        const req = new OutgoingRequest(headers);
        req.setMethod({ tag: "get" });
        req.setScheme({ tag: "HTTP" });
        req.setAuthority("localhost:${port}");
        req.setPathWithQuery("/api/test-echo");

        const outBody = req.body();
        OutgoingBody.finish(outBody, undefined);

        const future = handle(req, undefined);

        // Poll loop: subscribe-duration(0) + future.subscribe, then check get()
        let result;
        for (let i = 0; i < 1000; i++) {
            const timerPollable = subscribeDuration(0n);
            const futurePollable = future.subscribe();
            poll([timerPollable, futurePollable]);

            result = future.get();
            if (result) break;
        }

        if (!result) { throw "ERROR: no result from future after poll loop"; }
        if (result.tag === "err") { throw "ERROR: future error: " + JSON.stringify(result); }
        if (result.val.tag === "err") { throw "ERROR: HTTP error: " + JSON.stringify(result.val.val); }

        const response = result.val.val;
        const status = response.status();
        if (status !== 200) { throw "ERROR: expected 200, got " + status; }

        const incomingBody = response.consume();
        const stream = incomingBody.stream();

        let bodyBytes = new Uint8Array(0);
        try {
            while (true) {
                const pollable = stream.subscribe();
                pollable.block();
                const chunk = stream.read(65536n);
                const merged = new Uint8Array(bodyBytes.length + chunk.length);
                merged.set(bodyBytes);
                merged.set(chunk, bodyBytes.length);
                bodyBytes = merged;
            }
        } catch (e) {
            const tag = e.tag || (e.payload && e.payload.tag);
            if (tag !== "closed") { throw "ERROR: stream error: " + JSON.stringify(e); }
        }

        const bodyText = new TextDecoder().decode(bodyBytes);
        if (!bodyText.includes("hello from test server")) {
            throw "ERROR: body missing expected content, got: " + bodyText;
        }
        return bodyText;
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-http-poll-fetch",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/poll#poll",
                "wasi:io/streams#[method]input-stream.blocking-read",
                "wasi:clocks/monotonic-clock#subscribe-duration",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("hello from test server"));

        await cleanup();
    }, 120_000);

    test("http-blocking-read", async () => {
        const outDir = await getTmpDir();

        const { port, baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        // This component uses blocking-read instead of subscribe+block+read
        // to read the response body — matching how QuickJS and other sync
        // runtimes consume streams via JSPI
        const { component } = await componentize(
            `
import { Fields } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";
import { OutgoingRequest, OutgoingBody, IncomingBody } from "wasi:http/types@0.2.8";

export const test = {
    run() {
        const headers = Fields.fromList([]);
        const req = new OutgoingRequest(headers);
        req.setMethod({ tag: "get" });
        req.setScheme({ tag: "HTTP" });
        req.setAuthority("localhost:${port}");
        req.setPathWithQuery("/api/test-echo");

        const outBody = req.body();
        OutgoingBody.finish(outBody, undefined);

        const future = handle(req, undefined);

        const pollable = future.subscribe();
        pollable.block();

        const result = future.get();
        if (!result) { throw "ERROR: no result from future"; }
        if (result.tag === "err") { throw "ERROR: future error: " + JSON.stringify(result); }
        if (result.val.tag === "err") { throw "ERROR: HTTP error: " + JSON.stringify(result.val.val); }

        const response = result.val.val;
        const status = response.status();
        if (status !== 200) { throw "ERROR: expected 200, got " + status; }

        const incomingBody = response.consume();
        const stream = incomingBody.stream();

        let bodyBytes = new Uint8Array(0);
        try {
            while (true) {
                const chunk = stream.blockingRead(65536n);
                const merged = new Uint8Array(bodyBytes.length + chunk.length);
                merged.set(bodyBytes);
                merged.set(chunk, bodyBytes.length);
                bodyBytes = merged;
            }
        } catch (e) {
            const tag = e.tag || (e.payload && e.payload.tag);
            if (tag !== "closed") { throw "ERROR: stream error: " + JSON.stringify(e); }
        }

        const bodyText = new TextDecoder().decode(bodyBytes);
        if (!bodyText.includes("hello from test server")) {
            throw "ERROR: body missing expected content, got: [" + bodyText + "]";
        }
        return bodyText;
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-http-fetch",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/poll#poll",
                "wasi:io/streams#[method]input-stream.blocking-read",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("hello from test server"));

        await cleanup();
    }, 120_000);

    // Ported from wasmtime p2_sleep.rs
    test("clocks-sleep", async () => {
        const outDir = await getTmpDir();

        const { baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        const { component } = await componentize(
            `
import { now, subscribeDuration, subscribeInstant } from "wasi:clocks/monotonic-clock@0.2.8";

export const test = {
    run() {
        // sleep 10ms via subscribe-instant
        const dur = 10_000_000n;
        const p1 = subscribeInstant(now() + dur);
        p1.block();

        // sleep 10ms via subscribe-duration
        const p2 = subscribeDuration(dur);
        p2.block();

        // subscribe-duration(0) should resolve without hanging
        const p3 = subscribeDuration(0n);
        p3.block();

        // subscribe-instant in the past should resolve without hanging
        const p4 = subscribeInstant(now() - 1n);
        p4.block();

        return "clocks-sleep: all passed";
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-clocks-poll",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:clocks/monotonic-clock#subscribe-duration",
                "wasi:clocks/monotonic-clock#subscribe-instant",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("all passed"));

        await cleanup();
    });

    // Ported from wasmtime p2_pollable_correct.rs
    test("pollable-correct", async () => {
        const outDir = await getTmpDir();

        const { baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        const { component } = await componentize(
            `
import { subscribeDuration } from "wasi:clocks/monotonic-clock@0.2.8";
import { poll } from "wasi:io/poll@0.2.8";

export const test = {
    run() {
        const p1 = subscribeDuration(0n);
        const p2 = subscribeDuration(0n);

        // Same pollable passed multiple times + distinct pollables
        const ready = poll([p1, p2, p1, p2]);

        if (ready.length === 0) {
            throw "ERROR: poll returned empty array";
        }

        // All should be ready since duration is 0
        for (const idx of ready) {
            if (idx > 3) {
                throw "ERROR: poll returned out-of-bounds index: " + idx;
            }
        }

        // Verify poll with a single pollable
        const p3 = subscribeDuration(1_000_000n);
        const ready2 = poll([p3]);
        if (ready2.length === 0) {
            throw "ERROR: poll with single pollable returned empty";
        }

        return "pollable-correct: all passed";
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-clocks-poll",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/poll#poll",
                "wasi:clocks/monotonic-clock#subscribe-duration",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("all passed"));

        await cleanup();
    });

    // Ported from wasmtime p2_stream_pollable_correct.rs
    // Tests that pollables can be reused across multiple block() calls
    test("pollable-reuse", async () => {
        const outDir = await getTmpDir();

        const { baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        const { component } = await componentize(
            `
import { subscribeDuration } from "wasi:clocks/monotonic-clock@0.2.8";

export const test = {
    run() {
        const p = subscribeDuration(1_000_000n);

        // Pollable should be usable many times over its lifetime
        for (let i = 0; i < 5; i++) {
            p.block();
            if (!p.ready()) {
                throw "ERROR: after block(), ready() should be true (iteration " + i + ")";
            }
        }

        return "pollable-reuse: all passed";
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-clocks-poll",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:clocks/monotonic-clock#subscribe-duration",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("all passed"));

        await cleanup();
    });

    // Ported from wasmtime p2_http_outbound_request_{get,post,put}.rs
    test("http-methods", async () => {
        const outDir = await getTmpDir();

        const { port, baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        const { component } = await componentize(
            `
import { Fields, OutgoingRequest, OutgoingBody } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";

function doRequest(method, path, bodyData) {
    const enc = new TextEncoder();
    const headers = Fields.fromList([
        ["User-agent", enc.encode("WASI-HTTP/0.0.1")],
        ["Content-type", enc.encode("application/json")],
    ]);
    const req = new OutgoingRequest(headers);
    req.setMethod(method);
    req.setScheme({ tag: "HTTP" });
    req.setAuthority("localhost:${port}");
    req.setPathWithQuery(path);

    const outBody = req.body();
    if (bodyData) {
        const outStream = outBody.write();
        outStream.blockingWriteAndFlush(bodyData);
    }
    OutgoingBody.finish(outBody, undefined);

    const future = handle(req, undefined);
    const pollable = future.subscribe();
    pollable.block();

    const result = future.get();
    if (!result) throw "no result from future";
    if (result.tag === "err") throw "future error: " + JSON.stringify(result);
    if (result.val.tag === "err") throw "HTTP error: " + JSON.stringify(result.val.val);

    const response = result.val.val;
    const status = response.status();

    const respHeaders = response.headers();
    const dec = new TextDecoder();
    const getHeader = (name) => {
        const vals = respHeaders.get(name);
        return vals.length > 0 ? dec.decode(vals[0]) : null;
    };

    const incomingBody = response.consume();
    const stream = incomingBody.stream();
    let bodyBytes = new Uint8Array(0);
    try {
        while (true) {
            const p = stream.subscribe();
            p.block();
            const chunk = stream.read(65536n);
            const merged = new Uint8Array(bodyBytes.length + chunk.length);
            merged.set(bodyBytes);
            merged.set(chunk, bodyBytes.length);
            bodyBytes = merged;
        }
    } catch (e) {
        const tag = e.tag || (e.payload && e.payload.tag);
        if (tag !== "closed") throw "stream error: " + JSON.stringify(e);
    }

    return { status, getHeader, body: bodyBytes };
}

export const test = {
    run() {
        const dec = new TextDecoder();

        // GET with query string (p2_http_outbound_request_get)
        {
            const res = doRequest({ tag: "get" }, "/get?some=arg&goes=here");
            if (res.status !== 200) throw "GET: expected 200, got " + res.status;
            if (res.getHeader("x-wasmtime-test-method") !== "GET")
                throw "GET: wrong method header: " + res.getHeader("x-wasmtime-test-method");
            if (res.getHeader("x-wasmtime-test-uri") !== "/get?some=arg&goes=here")
                throw "GET: wrong uri header: " + res.getHeader("x-wasmtime-test-uri");
            if (res.body.length !== 0)
                throw "GET: expected empty body, got " + res.body.length + " bytes";
        }

        // POST with JSON body (p2_http_outbound_request_post)
        {
            const postData = new TextEncoder().encode('{"foo": "bar"}');
            const res = doRequest({ tag: "post" }, "/post", postData);
            if (res.status !== 200) throw "POST: expected 200, got " + res.status;
            if (res.getHeader("x-wasmtime-test-method") !== "POST")
                throw "POST: wrong method header";
            if (res.getHeader("x-wasmtime-test-uri") !== "/post")
                throw "POST: wrong uri header";
            const body = dec.decode(res.body);
            if (body !== '{"foo": "bar"}')
                throw "POST: expected echoed body, got: " + body;
        }

        // PUT with empty body (p2_http_outbound_request_put)
        {
            const res = doRequest({ tag: "put" }, "/put", new Uint8Array(0));
            if (res.status !== 200) throw "PUT: expected 200, got " + res.status;
            if (res.getHeader("x-wasmtime-test-method") !== "PUT")
                throw "PUT: wrong method header";
            if (res.getHeader("x-wasmtime-test-uri") !== "/put")
                throw "PUT: wrong uri header";
            if (res.body.length !== 0)
                throw "PUT: expected empty body, got " + res.body.length + " bytes";
        }

        return "http-methods: all passed";
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-http-fetch",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/poll#poll",
                "wasi:io/streams#[method]input-stream.blocking-read",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("all passed"));

        await cleanup();
    }, 120_000);

    // Ported from wasmtime p2_http_outbound_request_{invalid_header,response_build,
    // unknown_method,invalid_port,missing_path_and_query}.rs
    test("http-validation", async () => {
        const outDir = await getTmpDir();

        const { baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        const { component } = await componentize(
            `
import { Fields, OutgoingRequest, OutgoingBody } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";

function expectThrow(fn, expectedTag, label) {
    try {
        fn();
        throw "NOTHROW:" + label + ": should have thrown";
    } catch (e) {
        if (typeof e === "string" && e.startsWith("NOTHROW:")) throw e;
        const tag = e.tag || (e.payload && e.payload.tag);
        if (tag !== expectedTag) {
            throw label + ": expected " + expectedTag + ", got " + JSON.stringify(e);
        }
    }
}

function expectNoThrow(fn, label) {
    try {
        fn();
    } catch (e) {
        throw label + ": unexpected throw: " + JSON.stringify(e);
    }
}

export const test = {
    run() {
        // --- Header validation (p2_http_outbound_request_invalid_header) ---
        {
            const hdrs = Fields.fromList([]);

            // Bad header name
            expectThrow(
                () => hdrs.append("malformed header name", new TextEncoder().encode("ok value")),
                "invalid-syntax", "bad header name"
            );

            // Good header
            expectNoThrow(
                () => hdrs.append("ok-header-name", new TextEncoder().encode("ok value")),
                "good header"
            );

            // Bad header value (newline)
            expectThrow(
                () => hdrs.append("ok-header-name", new TextEncoder().encode("bad\\nvalue")),
                "invalid-syntax", "bad header value"
            );

            // Forbidden headers
            expectThrow(
                () => hdrs.append("Connection", new TextEncoder().encode("keep-alive")),
                "forbidden", "Connection header"
            );
            expectThrow(
                () => hdrs.append("Keep-Alive", new TextEncoder().encode("stuff")),
                "forbidden", "Keep-Alive header"
            );
            expectThrow(
                () => hdrs.append("Host", new TextEncoder().encode("example.com")),
                "forbidden", "Host header"
            );

            // fromList with bad header name
            expectThrow(
                () => Fields.fromList([["bad header", new TextEncoder().encode("value")]]),
                "invalid-syntax", "fromList bad name"
            );

            // fromList with bad header value
            expectThrow(
                () => Fields.fromList([["ok-name", new TextEncoder().encode("bad\\nvalue")]]),
                "invalid-syntax", "fromList bad value"
            );

            // Immutable headers: headers attached to a request become immutable
            const req = new OutgoingRequest(hdrs);
            const immutableHdrs = req.headers();
            expectThrow(
                () => immutableHdrs.set("Content-Length", [new TextEncoder().encode("10")]),
                "immutable", "immutable set"
            );
            expectThrow(
                () => immutableHdrs.append("Content-Length", new TextEncoder().encode("10")),
                "immutable", "immutable append"
            );
            expectThrow(
                () => immutableHdrs.delete("Content-Length"),
                "immutable", "immutable delete"
            );
        }

        // --- Request setter validation (p2_http_outbound_request_response_build) ---
        {
            const req = new OutgoingRequest(Fields.fromList([]));

            // Invalid method (contains space)
            expectThrow(
                () => req.setMethod({ tag: "other", val: "invalid method" }),
                undefined, "invalid method"
            );

            // Invalid path (contains newline)
            expectThrow(
                () => req.setPathWithQuery("/bad\\npath"),
                undefined, "invalid path"
            );
        }

        // --- Unknown method (p2_http_outbound_request_unknown_method) ---
        {
            const hdrs = Fields.fromList([]);
            const req = new OutgoingRequest(hdrs);
            expectThrow(
                () => req.setMethod({ tag: "other", val: "bad\\nmethod" }),
                undefined, "unknown method with newline"
            );
        }

        // --- Invalid port (p2_http_outbound_request_invalid_port) ---
        {
            const hdrs = Fields.fromList([]);
            const req = new OutgoingRequest(hdrs);
            expectThrow(
                () => req.setAuthority("localhost:99999"),
                undefined, "invalid port"
            );
        }

        // --- Missing path and query (p2_http_outbound_request_missing_path_and_query) ---
        {
            const hdrs = Fields.fromList([]);
            const req = new OutgoingRequest(hdrs);
            req.setMethod({ tag: "get" });
            req.setScheme({ tag: "HTTPS" });
            req.setAuthority("example.com");
            // Do NOT set path
            const outBody = req.body();
            OutgoingBody.finish(outBody, undefined);
            let threw = false;
            try {
                handle(req, undefined);
            } catch (e) {
                threw = true;
            }
            if (!threw) throw "missing path: handle() should have thrown";
        }

        return "http-validation: all passed";
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-http-fetch",
            } as ComponentizeOptions,
        );

        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            asyncImports: [
                "wasi:io/poll#[method]pollable.block",
                "wasi:io/poll#poll",
                "wasi:io/streams#[method]input-stream.blocking-read",
            ],
            asyncExports: ["tests:p2-shim/test#run"],
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.ok(statusJSON.msg?.includes("all passed"));

        await cleanup();
    }, 120_000);

    test("fs-open", async () => {
        const outDir = await getTmpDir();

        // Create a component that does a basic filesystem operation
        // This component complies with the component world for the basic-harness fixture
        //
        // TODO: we can pre-compile and cache components like this locally for faster runs
        const successMsg = "SUCCESS: opened file";
        const { component } = await componentize(
            `
import { getDirectories } from "wasi:filesystem/preopens@0.2.8";

export const test = {
    run() {
        const preopens = getDirectories();
        if (preopens.length === 0) { throw "ERROR: no preopens"; }

        const dirDescriptor = preopens[0][0];
        const dirRes = dirDescriptor.openAt(
            {symlinkFollow: false},
            ".",
            { create: true },
            { write: true },
        );
        if (dirRes.tag === "err") {
            throw "ERROR: failed to open dir: " + dirRes.val;
        }
        return "${successMsg}";
    }
}
`,
            {
                witPath: FIXTURES_WIT_DIR,
                worldName: "browser-fs-write",
            } as ComponentizeOptions,
        );

        // Transpile the component, write all output files to a temporary directory
        const { files }: TranspileOutput = await transpile(component, {
            name: "component",
            optimize: false,
            asyncMode: "jspi",
            outDir,
        });
        for (const [outPath, source] of Object.entries(files)) {
            await mkdir(dirname(outPath), { recursive: true });
            await writeFile(outPath, source);
        }

        // Start a test server
        const { baseURL, browser, cleanup } = await startTestServer({
            transpiledOutputDir: outDir,
        });

        // Run the test based on the basic harness code
        const { statusJSON } = await runBasicHarnessPageTest({
            browser,
            url: `${baseURL}/index.html#transpiled:component.js`,
        });

        assert.strictEqual(statusJSON.msg, successMsg);

        await cleanup();
    });
});

suite("Browser filesystem", () => {
    test("writeViaStream reuses file capacity", async () => {
        const { _setFileData, preopens } = await import("../src/browser/filesystem.js");
        const file = { source: new Uint8Array([1, 2, 3]) };
        _setFileData({ dir: { file } });

        const [[rootDescriptor]] = preopens.getDirectories();
        const descriptor = rootDescriptor.openAt({}, "file", {}, { write: true });
        const stream = descriptor.writeViaStream(3n);

        stream.checkWrite();
        stream.write(new Uint8Array([4, 5]));
        const buffer = file.source.buffer;
        stream.checkWrite();
        stream.write(new Uint8Array([6]));

        assert.strictEqual(file.source.buffer, buffer);
        assert.deepStrictEqual(file.source, new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    test("writeViaStream preserves overwrite and sparse-write semantics", async () => {
        const { _setFileData, preopens } = await import("../src/browser/filesystem.js");
        const file = { source: new Uint8Array([1, 2, 3, 4]) };
        _setFileData({ dir: { file } });

        const [[rootDescriptor]] = preopens.getDirectories();
        const descriptor = rootDescriptor.openAt({}, "file", {}, { write: true });

        const overwrite = descriptor.writeViaStream(1n);
        overwrite.checkWrite();
        overwrite.write(new Uint8Array([8, 9]));
        assert.deepStrictEqual(file.source, new Uint8Array([1, 8, 9, 4]));

        const sparse = descriptor.writeViaStream(6n);
        sparse.checkWrite();
        sparse.write(new Uint8Array([7]));
        assert.deepStrictEqual(file.source, new Uint8Array([1, 8, 9, 4, 0, 0, 7]));
    });

    test("supports append, resize, rename, and removal", async () => {
        const { _setFileData, preopens } = await import("../src/browser/filesystem.js");
        const file = { source: new Uint8Array([1, 2]) };
        _setFileData({ dir: { file, empty: { dir: {} } } });

        const [[root]] = preopens.getDirectories();
        const descriptor = root.openAt({}, "file", {}, { read: true, write: true });
        const append = descriptor.appendViaStream();
        append.checkWrite();
        append.write(new Uint8Array([3]));
        assert.deepStrictEqual(file.source, new Uint8Array([1, 2, 3]));

        descriptor.setSize(5n);
        assert.deepStrictEqual(file.source, new Uint8Array([1, 2, 3, 0, 0]));
        root.renameAt("file", root, "renamed");
        assert.strictEqual(root.statAt({}, "renamed").size, 5n);
        root.unlinkFileAt("renamed");
        assert.throws(() => root.statAt({}, "renamed"));
        root.removeDirectoryAt("empty");
        assert.throws(() => root.statAt({}, "empty"));
    });

    test("creates only the final path component", async () => {
        const { _setFileData, preopens } = await import("../src/browser/filesystem.js");
        const fileData = { dir: { parent: { dir: {} }, existing: { dir: {} } } };
        _setFileData(fileData);
        const [[root]] = preopens.getDirectories();

        let error: unknown;
        try {
            root.openAt({}, "missing/file", { create: true }, { write: true });
        } catch (caught) {
            error = caught;
        }
        assert.strictEqual(error, "no-entry");
        assert.strictEqual((fileData.dir as Record<string, unknown>).missing, undefined);

        const created = root.openAt({}, "parent/file", { create: true }, { write: true });
        assert.strictEqual(created.getType(), "regular-file");
        root.createDirectoryAt("parent/child");
        assert.strictEqual(root.statAt({}, "parent/child").type, "directory");
        error = undefined;
        try {
            root.createDirectoryAt("existing");
        } catch (caught) {
            error = caught;
        }
        assert.strictEqual(error, "exist");
    });

    test("renames entries without deleting or corrupting the tree", async () => {
        const { _setFileData, preopens } = await import("../src/browser/filesystem.js");
        _setFileData({
            dir: {
                file: { source: "source" },
                target: { source: "target" },
                directory: { dir: { child: { source: "child" } } },
                empty: { dir: {} },
                nonempty: { dir: { value: { source: "value" } } },
            },
        });
        const [[root]] = preopens.getDirectories();
        const thrownValue = (fn: () => void) => {
            try {
                fn();
            } catch (error) {
                return error;
            }
            assert.fail("operation should have thrown");
        };

        root.renameAt("file", root, "file");
        assert.strictEqual(root.statAt({}, "file").type, "regular-file");

        root.renameAt("file", root, "target");
        assert.strictEqual(root.statAt({}, "target").size, 6n);
        assert.strictEqual(
            thrownValue(() => root.statAt({}, "file")),
            "no-entry",
        );

        assert.strictEqual(
            thrownValue(() => root.renameAt("target", root, "empty")),
            "is-directory",
        );
        assert.strictEqual(
            thrownValue(() => root.renameAt("directory", root, "target")),
            "not-directory",
        );
        assert.strictEqual(
            thrownValue(() => root.renameAt("directory", root, "nonempty")),
            "not-empty",
        );

        const directory = root.openAt({}, "directory", { directory: true }, {});
        assert.strictEqual(
            thrownValue(() => root.renameAt("directory", directory, "descendant")),
            "invalid",
        );
        assert.strictEqual(root.statAt({}, "directory/child").type, "regular-file");

        root.renameAt("directory", root, "empty");
        assert.strictEqual(root.statAt({}, "empty/child").type, "regular-file");
    });

    test("shares identity and metadata across descriptors and hard links", async () => {
        const { _setFileData, preopens } = await import("../src/browser/filesystem.js");
        _setFileData({ dir: { file: { source: "value" } } });
        const [[root]] = preopens.getDirectories();
        const first = root.openAt({}, "file", {}, { read: true, write: true });
        const second = root.openAt({}, "file", {}, { read: true, write: true });

        assert.strictEqual(first.isSameObject(second), true);
        assert.deepStrictEqual(root.metadataHashAt({}, "file"), first.metadataHash());
        const before = first.metadataHash();
        second.write(new Uint8Array([1]), 0n);
        assert.notDeepEqual(first.metadataHash(), before);
        assert.deepStrictEqual(first.metadataHash(), second.metadataHash());

        root.linkAt({}, "file", root, "link");
        const link = root.openAt({}, "link", {}, { read: true });
        assert.strictEqual(first.isSameObject(link), true);
        assert.strictEqual(first.stat().linkCount, 2n);
        assert.strictEqual(link.stat().linkCount, 2n);
        root.unlinkFileAt("file");
        assert.strictEqual(link.stat().linkCount, 1n);
        assert.deepStrictEqual(root.metadataHashAt({}, "link"), link.metadataHash());
    });

    test("createFilesystem isolates explicitly selected in-memory roots", async () => {
        const { createFilesystem, InMemoryFilesystemAdapter } =
            await import("../src/browser/filesystem.js");
        const first = createFilesystem({
            adapter: new InMemoryFilesystemAdapter(),
            preopens: { "/first": { dir: { value: { source: "one" } } } },
        });
        const second = createFilesystem({
            adapter: new InMemoryFilesystemAdapter(),
            preopens: { "/second": { dir: { value: { source: "two" } } } },
        });

        assert.strictEqual(first.preopens.getDirectories()[0][1], "/first");
        assert.strictEqual(second.preopens.getDirectories()[0][1], "/second");
        first.dispose();
        assert.throws(() => first.preopens.getDirectories(), /disposed/);
        assert.strictEqual(second.preopens.getDirectories().length, 1);
    });
});

suite("Browser shim guards", () => {
    test("pollList throws on empty list", async () => {
        const { poll } = await import("../src/browser/io.js");
        assert.throws(() => poll.poll([]), /empty/);
    });

    test("pollList throws on list exceeding u32 range", async () => {
        const { poll } = await import("../src/browser/io.js");
        const fakeList = { length: 0x100000000 } as any;
        assert.throws(() => poll.poll(fakeList), /u32/);
    });

    test("pollables can be reused across readiness generations", async () => {
        const { pollableCreate } = await import("../src/browser/io.js");
        let ready = false;
        let waits = 0;
        let resolve!: () => void;
        const pollable = pollableCreate({
            ready: () => ready,
            wait: () => {
                waits++;
                return new Promise<void>((r) => (resolve = r));
            },
        });

        const first = pollable.block();
        const simultaneous = pollable.block();
        assert.strictEqual(waits, 1);
        ready = true;
        resolve();
        await Promise.all([first, simultaneous]);
        assert.strictEqual(pollable.ready(), true);

        ready = false;
        const second = pollable.block();
        assert.strictEqual(waits, 2);
        ready = true;
        resolve();
        await second;
    });

    test("poll reuses pollables and returns ready indices in input order", async () => {
        const { poll, pollableCreate } = await import("../src/browser/io.js");
        let firstReady = false;
        let secondReady = true;
        let resolveFirst!: () => void;
        let resolveSecond!: () => void;
        const first = pollableCreate({
            ready: () => firstReady,
            wait: () => new Promise<void>((resolve) => (resolveFirst = resolve)),
        });
        const second = pollableCreate({
            ready: () => secondReady,
            wait: () => new Promise<void>((resolve) => (resolveSecond = resolve)),
        });

        assert.deepStrictEqual(await poll.poll([first, second, first]), new Uint32Array([1]));
        secondReady = false;
        const next = poll.poll([first, second, first]);
        firstReady = true;
        resolveFirst();
        assert.deepStrictEqual(await next, new Uint32Array([0, 2]));

        firstReady = false;
        const final = poll.poll([first, second]);
        secondReady = true;
        resolveSecond();
        assert.deepStrictEqual(await final, new Uint32Array([1]));
    });

    test("browser streams validate u64 lengths and write permits", async () => {
        const { inputStreamCreate, outputStreamCreate } = await import("../src/browser/io.js");
        const input = inputStreamCreate({ blockingRead: () => new Uint8Array() });
        assert.throws(() => input.read(-1n), /valid u64/);
        assert.throws(() => input.read(BigInt(Number.MAX_SAFE_INTEGER) + 1n), /safe integer/);

        const output = outputStreamCreate({
            checkWrite: () => 2n,
            write() {},
        });
        assert.strictEqual(output.checkWrite(), 2n);
        assert.throws(() => output.write(new Uint8Array(3)), /exceeds the permit/);
        assert.throws(() => output.writeZeroes(3n), /exceeds the permit/);
        assert.throws(() => output.blockingWriteZeroesAndFlush(4097n), /at most 4096/);
    });

    test("browser blocking stream fallbacks flush and accept external pollables", async () => {
        const { inputStreamCreate, outputStreamCreate } = await import("../src/browser/io.js");
        const events: string[] = [];
        const output = outputStreamCreate({
            write: () => events.push("write"),
            flush: () => events.push("flush"),
        });
        output.blockingWriteAndFlush(new Uint8Array([1]));
        output.blockingFlush();
        assert.deepStrictEqual(events, ["write", "flush", "flush"]);

        const externalPollable = { ready: () => true, block() {} };
        const input = inputStreamCreate({
            blockingRead: () => new Uint8Array(),
            subscribe: () => externalPollable as any,
        });
        assert.strictEqual(input.subscribe(), externalPollable);
        (input as any)[symbolDispose]();
    });

    test("browser clocks validate u64 subscriptions and make elapsed timers ready", async () => {
        const { monotonicClock, wallClock } = await import("../src/browser/clocks.js");
        assert.strictEqual(typeof monotonicClock.resolution(), "bigint");
        assert.strictEqual(typeof wallClock.resolution().seconds, "bigint");
        assert.strictEqual(typeof wallClock.resolution().nanoseconds, "number");
        assert.strictEqual(monotonicClock.subscribeDuration(0n).ready(), true);
        assert.strictEqual(monotonicClock.subscribeInstant(monotonicClock.now()).ready(), true);
        assert.throws(() => monotonicClock.subscribeDuration(-1n), /valid u64/);
        assert.throws(() => monotonicClock.subscribeInstant(-1n), /valid u64/);
    });

    test("dropping browser streams disposes handlers exactly once", async () => {
        const { outputStreamCreate } = await import("../src/browser/io.js");
        let drops = 0;
        const output = outputStreamCreate({ write() {}, drop: () => drops++ });
        (output as any)[symbolDispose]();
        (output as any)[symbolDispose]();
        assert.strictEqual(drops, 1);
        try {
            output.checkWrite();
            assert.fail("closed output stream should reject checkWrite");
        } catch (error) {
            assert.deepStrictEqual(error, { tag: "closed" });
        }
    });

    test("dropping resources wakes blocked child pollables", async () => {
        const { inputStreamCreate, poll, pollableCreate } = await import("../src/browser/io.js");
        const input = inputStreamCreate({
            blockingRead: () => new Uint8Array(),
            subscribe: () =>
                // The source intentionally never becomes ready on its own.
                pollableCreate({
                    ready: () => false,
                    wait: () => new Promise<void>(() => {}),
                }),
        });
        const child = input.subscribe();
        const blocked = child.block();
        const polled = poll.poll([child]) as Promise<Uint32Array>;

        (input as any)[symbolDispose]();

        const blockError = await blocked.then(
            () => undefined,
            (error) => error,
        );
        const pollError = await polled.then(
            () => undefined,
            (error) => error,
        );
        assert.match(blockError.message, /parent resource has been disposed/);
        assert.match(pollError.message, /parent resource has been disposed/);
    });

    test("browser random rejects invalid allocation lengths", async () => {
        const { random } = await import("../src/browser/random.js");
        assert.throws(() => random.getRandomBytes(-1n), /valid u64/);
        assert.throws(
            () => random.getRandomBytes(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
            /safe integer/,
        );
    });

    test("browser raw sockets fail with not-supported", async () => {
        const sockets = await import("../src/browser/sockets.js");
        assert.strictEqual(
            sockets.instanceNetwork.instanceNetwork(),
            sockets.instanceNetwork.instanceNetwork(),
        );
        assert.throws(() => sockets.tcpCreateSocket.createTcpSocket("ipv4"), /not-supported/);
        assert.throws(() => sockets.udpCreateSocket.createUdpSocket("ipv4"), /not-supported/);
        assert.throws(
            () => sockets.ipNameLookup.resolveAddresses({} as any, "example.com"),
            /not-supported/,
        );
    });

    test("host-driven browser incoming HTTP round trips a response", async () => {
        const { handleIncomingRequest, types } = await import("../src/browser/http.js");
        const response = await handleIncomingRequest(
            new Request("https://example.com/test?value=1", { method: "POST", body: "request" }),
            (request, responseOut) => {
                assert.deepStrictEqual(request.method(), { tag: "post" });
                assert.strictEqual(request.pathWithQuery(), "/test?value=1");
                const outgoing = new types.OutgoingResponse(new types.Fields());
                outgoing.setStatusCode(201);
                const body = outgoing.body();
                const stream = body.write();
                stream.checkWrite();
                stream.write(new TextEncoder().encode("created"));
                types.OutgoingBody.finish(body, undefined);
                types.ResponseOutparam.set(responseOut, { tag: "ok", val: outgoing });
            },
        );
        assert.strictEqual(response.status, 201);
        assert.strictEqual(await response.text(), "created");
    });

    test("browser incoming HTTP rejects an unset response outparam", async () => {
        const { handleIncomingRequest } = await import("../src/browser/http.js");
        await rejects(
            handleIncomingRequest(new Request("https://example.com/"), () => {}),
            /without setting its response outparam/,
        );
    });

    test("browser incoming HTTP exposes an injectable handler namespace", async () => {
        const { createIncomingHandler, types } = await import("../src/browser/http.js");
        let called = false;
        const handler = createIncomingHandler((_request, responseOut) => {
            called = true;
            types.ResponseOutparam.set(responseOut, {
                tag: "err",
                val: { tag: "internal-error", val: "rejected" },
            });
        });
        const response = await handleIncomingViaNamespace(handler);
        assert.strictEqual(called, true);
        assert.strictEqual(response.status, 500);
        assert.match(await response.text(), /internal-error.*rejected/);

        async function handleIncomingViaNamespace(namespace: typeof handler) {
            const { handleIncomingRequest } = await import("../src/browser/http.js");
            return handleIncomingRequest(new Request("https://example.com/"), namespace.handle);
        }
    });

    test("browser outgoing HTTP waits for the complete request body", async () => {
        const { _setRequestStreaming, outgoingHandler, types } =
            await import("../src/browser/http.js");
        _setRequestStreaming(false);
        const originalFetch = globalThis.fetch;
        let requestedBody: Uint8Array | undefined;
        let fetchCalls = 0;
        globalThis.fetch = async (_input, init) => {
            fetchCalls++;
            requestedBody = new Uint8Array(await new Response(init?.body).arrayBuffer());
            return new Response("ok");
        };
        try {
            const request = new types.OutgoingRequest(new types.Fields());
            request.setMethod({ tag: "post" });
            request.setScheme({ tag: "HTTPS" });
            request.setAuthority("example.com");
            request.setPathWithQuery("/");
            const body = request.body();
            const stream = body.write();

            const response = outgoingHandler.handle(request, undefined);
            await Promise.resolve();
            assert.strictEqual(fetchCalls, 0);

            stream.checkWrite();
            stream.write(new TextEncoder().encode("complete body"));
            types.OutgoingBody.finish(body, undefined);
            await response.subscribe().block();

            assert.strictEqual(fetchCalls, 1);
            assert.strictEqual(new TextDecoder().decode(requestedBody), "complete body");
            throws(
                () => stream.write(new Uint8Array([0])),
                ({ tag }) => tag === "closed",
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("browser outgoing HTTP can stream request bodies to Fetch", async () => {
        const { _setRequestStreaming, outgoingHandler, types } =
            await import("../src/browser/http.js");
        const originalFetch = globalThis.fetch;
        let fetchCalls = 0;
        let duplex: string | undefined;
        let bodyText: Promise<string> | undefined;
        globalThis.fetch = async (_input, init) => {
            fetchCalls++;
            duplex = (init as RequestInit & { duplex?: string }).duplex;
            bodyText = new Response(init?.body).text();
            return new Response("ok");
        };
        _setRequestStreaming(true);
        try {
            const request = new types.OutgoingRequest(new types.Fields());
            request.setMethod({ tag: "post" });
            request.setScheme({ tag: "HTTPS" });
            request.setAuthority("example.com");
            request.setPathWithQuery("/");
            const body = request.body();
            const stream = body.write();
            stream.checkWrite();
            stream.write(new TextEncoder().encode("before "));

            const response = outgoingHandler.handle(request, undefined);
            await Promise.resolve();
            assert.strictEqual(fetchCalls, 1);
            assert.strictEqual(duplex, "half");

            stream.checkWrite();
            stream.write(new TextEncoder().encode("finish"));
            types.OutgoingBody.finish(body, undefined);
            assert.strictEqual(await bodyText, "before finish");
            await response.subscribe().block();
        } finally {
            _setRequestStreaming(false);
            globalThis.fetch = originalFetch;
        }
    });

    test("browser CLI factories isolate configuration and streams", async () => {
        const { createCli } = await import("../src/browser/cli.js");
        const firstWrites: number[] = [];
        const secondWrites: number[] = [];
        const first = createCli({
            environment: { INSTANCE: "first" },
            arguments: ["one"],
            stdout: { write: (bytes) => firstWrites.push(...bytes) },
        });
        const second = createCli({
            environment: { INSTANCE: "second" },
            arguments: ["two"],
            stdout: { write: (bytes) => secondWrites.push(...bytes) },
        });

        assert.deepStrictEqual(first.environment.getEnvironment(), [["INSTANCE", "first"]]);
        assert.deepStrictEqual(second.environment.getEnvironment(), [["INSTANCE", "second"]]);
        const firstStdout = first.stdout.getStdout();
        firstStdout.checkWrite();
        firstStdout.write(new Uint8Array([1, 2]));
        assert.deepStrictEqual(firstWrites, [1, 2]);
        assert.deepStrictEqual(secondWrites, []);
        assert.strictEqual(first.terminalStdout.getTerminalStdout(), undefined);
    });

    test("RequestOptions rejects negative connect timeout", async () => {
        const { types } = await import("../src/browser/http.js");
        const opts = new types.RequestOptions();
        assert.throws(() => opts.setConnectTimeout(-1n), /negative/);
    });

    test("RequestOptions rejects negative first-byte timeout", async () => {
        const { types } = await import("../src/browser/http.js");
        const opts = new types.RequestOptions();
        assert.throws(() => opts.setFirstByteTimeout(-1n), /negative/);
    });

    test("RequestOptions rejects negative between-bytes timeout", async () => {
        const { types } = await import("../src/browser/http.js");
        const opts = new types.RequestOptions();
        assert.throws(() => opts.setBetweenBytesTimeout(-1n), /negative/);
    });

    test("browser HTTP options preserve undefined timeouts", async () => {
        const { types } = await import("../src/browser/http.js");
        const opts = new types.RequestOptions();
        assert.strictEqual(opts.connectTimeout(), undefined);
        opts.setConnectTimeout(10n);
        opts.setConnectTimeout(undefined);
        opts.setFirstByteTimeout(undefined);
        opts.setBetweenBytesTimeout(undefined);
        assert.strictEqual(opts.connectTimeout(), undefined);
        assert.strictEqual(opts.firstByteTimeout(), undefined);
        assert.strictEqual(opts.betweenBytesTimeout(), undefined);
    });

    test("browser HTTP validates DNS, IPv4, and IPv6 authorities", async () => {
        const { types } = await import("../src/browser/http.js");
        const request = new types.OutgoingRequest(new types.Fields());
        for (const authority of ["example.com", "127.0.0.1:8080", "[::1]:8080"]) {
            request.setAuthority(authority);
            assert.strictEqual(request.authority(), authority);
        }
        for (const authority of [
            "",
            "user@example.com",
            "example.com:",
            "example.com:65536",
            "::1",
            "[not-ipv6]",
        ]) {
            throws(() => request.setAuthority(authority));
        }
    });

    test("browser HTTP preserves repeated outgoing headers", async () => {
        const { outgoingHandler, types } = await import("../src/browser/http.js");
        const originalFetch = globalThis.fetch;
        let receivedHeader: string | null = null;
        globalThis.fetch = async (_input, init) => {
            receivedHeader = (init?.headers as Headers).get("x-repeat");
            return new Response();
        };
        try {
            const encoder = new TextEncoder();
            const request = new types.OutgoingRequest(
                types.Fields.fromList([
                    ["x-repeat", encoder.encode("one")],
                    ["x-repeat", encoder.encode("two")],
                ]),
            );
            request.setAuthority("example.com");
            request.setPathWithQuery("/");
            const response = outgoingHandler.handle(request, undefined);
            await response.subscribe().block();
            assert.strictEqual(receivedHeader, "one, two");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
