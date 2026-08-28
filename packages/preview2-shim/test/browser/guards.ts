import { rejects, throws } from "node:assert";

import { suite, test, assert } from "vitest";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

suite("Browser shim guards", () => {
    test("pollList throws on empty list", async () => {
        const { poll } = await import("../../src/browser/io.js");
        assert.throws(() => poll.poll([]), /empty/);
    });

    test("pollList throws on list exceeding u32 range", async () => {
        const { poll } = await import("../../src/browser/io.js");
        const fakeList = { length: 0x100000000 } as any;
        assert.throws(() => poll.poll(fakeList), /u32/);
    });

    test("pollables can be reused across readiness generations", async () => {
        const { pollableCreate } = await import("../../src/browser/io.js");
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
        const { poll, pollableCreate } = await import("../../src/browser/io.js");
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
        const { inputStreamCreate, outputStreamCreate } = await import("../../src/browser/io.js");
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
        const { inputStreamCreate, outputStreamCreate } = await import("../../src/browser/io.js");
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
        const { monotonicClock, wallClock } = await import("../../src/browser/clocks.js");
        assert.strictEqual(typeof monotonicClock.resolution(), "bigint");
        assert.strictEqual(typeof wallClock.resolution().seconds, "bigint");
        assert.strictEqual(typeof wallClock.resolution().nanoseconds, "number");
        assert.strictEqual(monotonicClock.subscribeDuration(0n).ready(), true);
        assert.strictEqual(monotonicClock.subscribeInstant(monotonicClock.now()).ready(), true);
        assert.throws(() => monotonicClock.subscribeDuration(-1n), /valid u64/);
        assert.throws(() => monotonicClock.subscribeInstant(-1n), /valid u64/);
    });

    test("dropping browser streams disposes handlers exactly once", async () => {
        const { outputStreamCreate } = await import("../../src/browser/io.js");
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
        const { inputStreamCreate, poll, pollableCreate } = await import("../../src/browser/io.js");
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
        const { random } = await import("../../src/browser/random.js");
        assert.throws(() => random.getRandomBytes(-1n), /valid u64/);
        assert.throws(
            () => random.getRandomBytes(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
            /safe integer/,
        );
    });

    test("browser raw sockets fail with not-supported", async () => {
        const sockets = await import("../../src/browser/sockets.js");
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

    test("browser TCP namespaces can be supplied by an application", async () => {
        const { WASIShim } = await import("../../src/common/instantiation.js");
        const { InMemoryTcpSockets } = await import("../../src/browser/sockets.js");
        const tcpSockets = new InMemoryTcpSockets();
        const shim = new WASIShim({ tcpSockets });
        const imports = shim.getImportObject();
        const serverAddress = {
            tag: "ipv4" as const,
            val: { address: [127, 0, 0, 1] as [number, number, number, number], port: 8080 },
        };
        const client = tcpSockets.connect(serverAddress);
        client.write(new TextEncoder().encode("in-memory TCP"));
        const socket = imports["wasi:sockets/tcp-create-socket"].createTcpSocket("ipv4");
        socket.startBind(imports["wasi:sockets/instance-network"].instanceNetwork(), serverAddress);
        socket.finishBind();
        socket.startListen();
        socket.finishListen();
        const [, input, output] = socket.accept();
        const message = input.blockingRead(64n);
        output.checkWrite();
        output.write(message);

        assert.strictEqual(new TextDecoder().decode(client.read()), "in-memory TCP");
        assert.deepStrictEqual(socket.localAddress(), serverAddress);
    });

    test("browser UDP namespaces can be supplied by an application", async () => {
        const { WASIShim } = await import("../../src/common/instantiation.js");
        const { InMemoryUdpSockets } = await import("../../src/browser/sockets.js");
        const udpSockets = new InMemoryUdpSockets();
        const shim = new WASIShim({ udpSockets });
        const imports = shim.getImportObject();
        const socket = imports["wasi:sockets/udp-create-socket"].createUdpSocket("ipv4");
        const localAddress = {
            tag: "ipv4" as const,
            val: { address: [127, 0, 0, 1] as [number, number, number, number], port: 8080 },
        };
        const clientAddress = {
            tag: "ipv4" as const,
            val: { address: [127, 0, 0, 1] as [number, number, number, number], port: 9090 },
        };
        const client = udpSockets.createClient(clientAddress);
        client.send(new TextEncoder().encode("in-memory UDP"), localAddress);

        socket.startBind(imports["wasi:sockets/instance-network"].instanceNetwork(), localAddress);
        socket.finishBind();
        const [incoming, outgoing] = socket.stream(undefined);
        assert.strictEqual(outgoing.checkSend(), 1_024n);
        assert.strictEqual(
            outgoing.send([
                {
                    data: incoming.receive(1n)[0].data,
                    remoteAddress: clientAddress,
                },
            ]),
            1n,
        );

        assert.strictEqual(new TextDecoder().decode(client.read()), "in-memory UDP");
        assert.deepStrictEqual(socket.localAddress(), localAddress);
    });

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

    test("browser CLI factories isolate configuration and streams", async () => {
        const { createCli } = await import("../../src/browser/cli.js");
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
