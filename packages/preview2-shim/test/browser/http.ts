import { rejects, throws } from "node:assert";

import { suite, test, assert } from "vitest";

suite("Browser HTTP", () => {
    test("host-driven browser incoming HTTP round trips a response", async () => {
        const { handleIncomingRequest, types } = await import("../../src/browser/http.js");
        const response = await handleIncomingRequest(
            new Request("https://example.com/test?value=1", { method: "POST", body: "request" }),
            (request, responseOut) => {
                assert.deepStrictEqual(request.method(), { tag: "post" });
                assert.strictEqual(request.pathWithQuery(), "/test?value=1");
                assert.strictEqual(
                    new TextDecoder().decode(request.consume().stream().blockingRead(64n)),
                    "request",
                );
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
        const { handleIncomingRequest } = await import("../../src/browser/http.js");
        await rejects(
            handleIncomingRequest(new Request("https://example.com/"), () => {}),
            /without setting its response outparam/,
        );
    });

    test("browser incoming HTTP exposes an injectable handler namespace", async () => {
        const http = await import("../../src/browser/http.js");
        const { WASIShim } = await import("../../src/common/instantiation.js");
        let called = false;
        const shim = new WASIShim({
            http,
            incomingHandler: async (request) => {
                called = true;
                assert.strictEqual(request.method, "POST");
                assert.strictEqual(await request.text(), "request body");
                return new Response("accepted", {
                    status: 202,
                    headers: { "x-handler": "web" },
                });
            },
        });
        const handler = shim.getImportObject()["wasi:http/incoming-handler"];
        const response = await http.handleIncomingRequest(
            new Request("https://example.com/submit", {
                method: "POST",
                body: "request body",
            }),
            handler.handle,
        );

        assert.strictEqual(called, true);
        assert.strictEqual(response.status, 202);
        assert.strictEqual(response.headers.get("x-handler"), "web");
        assert.strictEqual(await response.text(), "accepted");
    });

    test("in-memory HTTP client invokes a WASI incoming handler", async () => {
        const { createIncomingHandler, InMemoryHttpClient } =
            await import("../../src/browser/http.js");
        const client = new InMemoryHttpClient(
            createIncomingHandler(
                async (request) => new Response(`echo: ${await request.text()}`, { status: 201 }),
            ),
        );
        const response = await client.fetch(
            new Request("https://example.com/echo", { method: "POST", body: "hello" }),
        );

        assert.strictEqual(response.status, 201);
        assert.strictEqual(await response.text(), "echo: hello");
    });

    test("browser incoming HTTP maps Web handler failures to error responses", async () => {
        const { createIncomingHandler, handleIncomingRequest } =
            await import("../../src/browser/http.js");
        const handler = createIncomingHandler(() => {
            throw new Error("rejected");
        });
        const response = await handleIncomingRequest(
            new Request("https://example.com/"),
            handler.handle,
        );
        assert.strictEqual(response.status, 500);
        assert.match(await response.text(), /internal-error.*rejected/);
    });

    test("browser incoming HTTP body read() returns empty instead of throwing before the first chunk arrives", async () => {
        const { outgoingHandler, types } = await import("../../src/browser/http.js");
        const originalFetch = globalThis.fetch;
        let releaseChunk: () => void;
        const gate = new Promise<void>((resolve) => {
            releaseChunk = resolve;
        });
        globalThis.fetch = async () => {
            const stream = new ReadableStream<Uint8Array>({
                async start(controller) {
                    // Delay the first chunk so a non-blocking read() lands
                    // before any data is buffered - this is the exact
                    // condition that used to throw an invalid `would-block`
                    // stream-error and hang JSPI-driven callers forever.
                    await gate;
                    controller.enqueue(new TextEncoder().encode("delayed"));
                    controller.close();
                },
            });
            return new Response(stream, { status: 200 });
        };
        try {
            const request = new types.OutgoingRequest(new types.Fields());
            request.setMethod({ tag: "get" });
            request.setScheme({ tag: "HTTPS" });
            request.setAuthority("example.com");
            request.setPathWithQuery("/");

            const future = outgoingHandler.handle(request, undefined);
            await future.subscribe().block();
            const result = future.get();
            if (!result || result.tag !== "ok" || result.val.tag !== "ok") {
                throw new Error("expected an ok response result");
            }
            const incomingResponse = result.val.val;
            const bodyStream = incomingResponse.consume().stream();

            const firstRead = bodyStream.read(64n);
            assert.deepStrictEqual(firstRead, new Uint8Array(0));

            releaseChunk!();
            await bodyStream.subscribe().block();
            const secondRead = bodyStream.read(64n);
            assert.strictEqual(new TextDecoder().decode(secondRead), "delayed");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("browser outgoing HTTP waits for the complete request body", async () => {
        const { _setRequestStreaming, outgoingHandler, types } =
            await import("../../src/browser/http.js");
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
            await import("../../src/browser/http.js");
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

    test("RequestOptions rejects negative connect timeout", async () => {
        const { types } = await import("../../src/browser/http.js");
        const opts = new types.RequestOptions();
        assert.throws(() => opts.setConnectTimeout(-1n), /negative/);
    });

    test("RequestOptions rejects negative first-byte timeout", async () => {
        const { types } = await import("../../src/browser/http.js");
        const opts = new types.RequestOptions();
        assert.throws(() => opts.setFirstByteTimeout(-1n), /negative/);
    });

    test("RequestOptions rejects negative between-bytes timeout", async () => {
        const { types } = await import("../../src/browser/http.js");
        const opts = new types.RequestOptions();
        assert.throws(() => opts.setBetweenBytesTimeout(-1n), /negative/);
    });

    test("browser HTTP options preserve undefined timeouts", async () => {
        const { types } = await import("../../src/browser/http.js");
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
        const { types } = await import("../../src/browser/http.js");
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
        const { outgoingHandler, types } = await import("../../src/browser/http.js");
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
