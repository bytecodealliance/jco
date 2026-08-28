import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createSecureServer } from "node:http2";
import { dirname } from "node:path";

import { suite, test, assert } from "vitest";
import { componentize, ComponentizeOptions } from "@bytecodealliance/componentize-js";
import { transpile } from "@bytecodealliance/jco";

import { getTmpDir, FIXTURES_WIT_DIR, startTestServer, runBasicHarnessPageTest } from "./common.js";

type TranspileOutput = { files: { [filename: string]: Uint8Array } };
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
