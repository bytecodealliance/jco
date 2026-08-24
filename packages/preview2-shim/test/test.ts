import { env } from "node:process";
import { throws } from "node:assert";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { suite, test, assert, beforeEach, afterEach } from "vitest";
import {
    IpAddress,
    IpSocketAddress,
    Ipv4Address,
} from "../types/interfaces/wasi-sockets-network.js";

const ADVICE_VALUES = [
    "normal",
    "sequential",
    "random",
    "will-need",
    "dont-need",
    "no-reuse",
] as const;

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

suite("Node.js Preview2", () => {
    test("Stdio", async () => {
        const { cli } = await import("@bytecodealliance/preview2-shim");
        cli.stdout.getStdout().blockingWriteAndFlush(new TextEncoder().encode("test stdout"));
        cli.stderr.getStderr().blockingWriteAndFlush(new TextEncoder().encode("test stderr"));
    });

    suite("Clocks", () => {
        test("Wall clock", async () => {
            const {
                clocks: { wallClock },
            } = await import("@bytecodealliance/preview2-shim");

            {
                const { seconds, nanoseconds } = wallClock.now();
                assert.strictEqual(typeof seconds, "bigint");
                assert.strictEqual(typeof nanoseconds, "number");
            }

            {
                const { seconds, nanoseconds } = wallClock.resolution();
                assert.strictEqual(typeof seconds, "bigint");
                assert.strictEqual(typeof nanoseconds, "number");
            }
        });

        test("Monotonic clock now", async () => {
            const {
                clocks: { monotonicClock },
            } = await import("@bytecodealliance/preview2-shim");

            assert.strictEqual(typeof monotonicClock.resolution(), "bigint");
            const curNow = monotonicClock.now();
            assert.strictEqual(typeof curNow, "bigint");
            assert.ok(monotonicClock.now() > curNow);
        });

        test("Monotonic clock immediately resolved polls", async () => {
            const {
                clocks: { monotonicClock },
            } = await import("@bytecodealliance/preview2-shim");
            const curNow = monotonicClock.now();
            {
                const poll = monotonicClock.subscribeInstant(curNow - 10n);
                assert.ok(poll.ready());
            }
            {
                const poll = monotonicClock.subscribeDuration(0n);
                assert.ok(poll.ready());
            }
        });

        test("Monotonic clock subscribe duration", async () => {
            const {
                clocks: { monotonicClock },
            } = await import("@bytecodealliance/preview2-shim");

            const curNow = monotonicClock.now();

            const poll = monotonicClock.subscribeDuration(BigInt(10e6));
            poll.block();

            // verify we are at the right time, and within 1ms of the original now
            const nextNow = monotonicClock.now();
            assert.ok(nextNow - curNow >= 10e6);
            if (!env.CI) {
                assert.ok(nextNow - curNow < 15e6);
            }
        });

        test("Monotonic clock subscribe instant", async () => {
            const {
                clocks: { monotonicClock },
            } = await import("@bytecodealliance/preview2-shim");

            const curNow = monotonicClock.now();

            const poll = monotonicClock.subscribeInstant(curNow + BigInt(10e6));
            poll.block();

            // verify we are at the right time, and within 1ms of the original now
            const nextNow = monotonicClock.now();
            const elapsed = nextNow - curNow;
            assert.ok(elapsed >= 10e6);
            if (!env.CI) {
                assert.ok(elapsed < 15e6);
            }
        });
    });

    test("FS read", async () => {
        let toDispose: any[] = [];
        await (async () => {
            const { filesystem } = await import("@bytecodealliance/preview2-shim");
            const [[rootDescriptor]] = filesystem.preopens.getDirectories();
            const childDescriptor = rootDescriptor.openAt(
                {},
                fileURLToPath(import.meta.url).slice(1),
                {},
                { read: true },
            );
            const stream = childDescriptor.readViaStream(0n);
            const poll = stream.subscribe();
            poll.block();
            let buf = stream.read(10000n);
            while (buf.byteLength === 0) {
                buf = stream.read(10000n);
            }
            const source = new TextDecoder().decode(buf);
            assert.ok(source.includes("UNIQUE STRING"));
            toDispose.push(stream);
            toDispose.push(childDescriptor);
        })();

        // Force the Poll to GC so the next dispose doesn't trap
        // @ts-expect-error gc is defined when running with --expose-gc
        gc();
        await new Promise((resolve) => setTimeout(resolve, 200));

        for (const item of toDispose) {
            item[symbolDispose]();
        }
    });

    test("FS advise", async () => {
        const { filesystem } = await import("@bytecodealliance/preview2-shim");
        const [[rootDescriptor]] = filesystem.preopens.getDirectories();
        const descriptor = rootDescriptor.openAt(
            {},
            fileURLToPath(import.meta.url).slice(1),
            {},
            { read: true },
        );

        for (const advice of ADVICE_VALUES) {
            assert.doesNotThrow(() => descriptor.advise(0n, 0n, advice));
        }

        descriptor[symbolDispose]();
    });

    test("Fields.set on a fresh Fields", async () => {
        const { http } = await import("@bytecodealliance/preview2-shim");
        const { Fields } = http.types;
        const encoder = new TextEncoder();

        // valid set on a new key must succeed (regression for #1503)
        const fields = Fields.fromList([]);
        fields.set("content-type", [encoder.encode("text/plain; charset=utf-8")]);

        const entries = fields.entries();
        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0][0], "content-type");
        assert.deepEqual(entries[0][1], encoder.encode("text/plain; charset=utf-8"));
    });

    test("Fields.set replaces existing values", async () => {
        const { http } = await import("@bytecodealliance/preview2-shim");
        const { Fields } = http.types;
        const encoder = new TextEncoder();

        const fields = Fields.fromList([["content-type", encoder.encode("text/plain")]]);
        fields.set("content-type", [encoder.encode("application/json")]);

        const entries = fields.entries();
        assert.strictEqual(entries.length, 1);
        assert.deepEqual(entries[0][1], encoder.encode("application/json"));
    });

    test("Fields.set with an empty values list registers the key with no entries", async () => {
        // The fix introduces a new else-branch that initializes
        // `this.#table.set(lowercased, [])` for new keys. Calling set with an
        // empty values list exercises that branch without pushing any entry,
        // so this locks in the resulting state.
        const { http } = await import("@bytecodealliance/preview2-shim");
        const { Fields } = http.types;

        const fields = Fields.fromList([]);
        fields.set("x-foo", []);

        assert.strictEqual(fields.has("x-foo"), true);
        assert.deepEqual(fields.get("x-foo"), []);
        assert.strictEqual(fields.entries().length, 0);
    });

    test("Fields.set throws immutable when fields are locked", async () => {
        const { http } = await import("@bytecodealliance/preview2-shim");
        const { Fields, OutgoingRequest } = http.types;
        const encoder = new TextEncoder();

        // OutgoingRequest's constructor locks the Fields passed in.
        const hdrs = Fields.fromList([]);
        new OutgoingRequest(hdrs);

        throws(
            () => hdrs.set("content-type", [encoder.encode("text/plain")]),
            (err: any) => err?.tag === "immutable",
        );
    });

    test("Fields.set throws invalid-syntax for an invalid name", async () => {
        const { http } = await import("@bytecodealliance/preview2-shim");
        const { Fields } = http.types;
        const encoder = new TextEncoder();

        const fields = Fields.fromList([]);
        throws(
            // names with spaces are rejected by node:http's validateHeaderName
            () => fields.set("bad header", [encoder.encode("ok value")]),
            (err: any) => err?.tag === "invalid-syntax",
        );
    });

    test("Fields.set throws invalid-syntax for an invalid value", async () => {
        const { http } = await import("@bytecodealliance/preview2-shim");
        const { Fields } = http.types;
        const encoder = new TextEncoder();

        const fields = Fields.fromList([]);
        throws(
            // values containing CR/LF are rejected by node:http's validateHeaderValue
            () => fields.set("x-foo", [encoder.encode("bad\nvalue")]),
            (err: any) => err?.tag === "invalid-syntax",
        );
    });

    test("Fields.set throws forbidden for restricted header names", async () => {
        const { http } = await import("@bytecodealliance/preview2-shim");
        const { Fields } = http.types;
        const encoder = new TextEncoder();

        // _forbiddenHeaders is { connection, keep-alive, host } (lowercased),
        // so the input is matched case-insensitively.
        for (const name of ["Connection", "Keep-Alive", "Host"]) {
            const fields = Fields.fromList([]);
            throws(
                () => fields.set(name, [encoder.encode("x")]),
                (err: any) => err?.tag === "forbidden",
                `expected forbidden for ${name}`,
            );
        }
    });

    test(
        "WASI HTTP",
        testWithGCWrap(async () => {
            const { http } = await import("@bytecodealliance/preview2-shim");
            const { handle } = http.outgoingHandler;
            const { OutgoingRequest, OutgoingBody, Fields } = http.types;
            const encoder = new TextEncoder();
            const request = new OutgoingRequest(
                Fields.fromList([
                    ["User-agent", encoder.encode("WASI-HTTP/0.0.1")],
                    ["Content-type", encoder.encode("application/json")],
                ]),
            );
            request.setPathWithQuery("/");
            request.setAuthority("webassembly.org");
            request.setScheme({ tag: "HTTPS" });

            const outgoingBody = request.body();
            OutgoingBody.finish(outgoingBody, undefined);

            const futureIncomingResponse = handle(request, undefined);
            futureIncomingResponse.subscribe().block();
            const incomingResponseResult = futureIncomingResponse.get()?.val;

            if (!incomingResponseResult) {
                throw new Error("Request failed: no response");
            }

            if (incomingResponseResult.tag !== "ok") {
                throw incomingResponseResult.val;
            }

            const incomingResponse = incomingResponseResult.val;

            const status = incomingResponse.status();
            const responseHeaders = incomingResponse.headers().entries();

            const decoder = new TextDecoder();
            const headers = Object.fromEntries(
                responseHeaders.map(([k, v]: [string, Uint8Array]) => [k, decoder.decode(v)]),
            );

            let responseBody;
            const incomingBody = incomingResponse.consume();
            {
                const bodyStream = incomingBody.stream();
                bodyStream.subscribe().block();
                let buf = bodyStream.read(5000n);
                while (buf.byteLength === 0) {
                    try {
                        buf = bodyStream.read(5000n);
                    } catch (e: any) {
                        if (e?.tag === "closed") {
                            break;
                        }
                        throw e?.val || e;
                    }
                }
                responseBody = new TextDecoder().decode(buf);
            }

            const futureTrailers = http.types.IncomingBody.finish(incomingBody);
            const trailersPollable = futureTrailers.subscribe();
            trailersPollable.block();
            assert.ok(trailersPollable.ready());
            const trailersResult = futureTrailers.get();
            if (!trailersResult || trailersResult.tag !== "ok" || trailersResult.val.tag !== "ok") {
                throw new Error("expected successful trailers result");
            }
            const trailers = trailersResult.val.val;
            if (!trailers) {
                throw new Error("expected present trailers");
            }
            assert.deepStrictEqual(trailers.entries(), []);
            throws(
                () => trailers.append("x-test", encoder.encode("value")),
                (err: any) => err?.tag === "immutable",
            );
            assert.strictEqual(futureTrailers.get()?.tag, "err");

            assert.strictEqual(status, 200);
            assert.ok(headers["content-type"].startsWith("text/html"));
            assert.ok(responseBody.includes("WebAssembly"));
        }),
    );

    suite("WASI Sockets (TCP)", async () => {
        test("sockets.instanceNetwork() should be a singleton", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const network1 = sockets.instanceNetwork.instanceNetwork();
            const network2 = sockets.instanceNetwork.instanceNetwork();
            assert.strictEqual(network1, network2);
        });

        test("sockets.tcpCreateSocket() should throw not-supported", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const socket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
            assert.notEqual(socket, null);

            throws(
                () => {
                    sockets.tcpCreateSocket.createTcpSocket("abc" as any);
                },
                (err: any) => err === "not-supported",
            );
        });
        test("tcp.bind(): should bind to a valid ipv4 address", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const network = sockets.instanceNetwork.instanceNetwork();
            const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
            const localAddress: IpSocketAddress = {
                tag: "ipv4",
                val: {
                    address: [0, 0, 0, 0],
                    port: 1337,
                },
            };
            tcpSocket.startBind(network, localAddress);
            tcpSocket.finishBind();

            assert.deepStrictEqual(tcpSocket.localAddress(), {
                tag: "ipv4",
                val: {
                    address: [0, 0, 0, 0],
                    port: 1337,
                },
            });
            assert.strictEqual(tcpSocket.addressFamily(), "ipv4");
        });

        test("tcp.bind(): should bind to a valid ipv6 address and port=0", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const network = sockets.instanceNetwork.instanceNetwork();
            const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv6");
            const localAddress: IpSocketAddress = {
                tag: "ipv6",
                val: {
                    address: [0, 0, 0, 0, 0, 0, 0, 0],
                    port: 0,
                    flowInfo: 0,
                    scopeId: 0,
                },
            };
            tcpSocket.startBind(network, localAddress);
            tcpSocket.finishBind();

            assert.strictEqual(tcpSocket.addressFamily(), "ipv6");

            const boundAddress = tcpSocket.localAddress();
            const expectedAddress = {
                tag: "ipv6",
                val: {
                    address: [0, 0, 0, 0, 0, 0, 0, 0],
                    // port will be assigned by the OS, so it should be > 0
                    // port: 0,
                },
            };

            assert.strictEqual(boundAddress.tag, expectedAddress.tag);
            assert.deepStrictEqual(boundAddress.val.address, expectedAddress.val.address);
            assert.strictEqual(boundAddress.val.port > 0, true);
        });

        test("tcp.bind(): should throw invalid-argument when invalid address family", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");

            const network = sockets.instanceNetwork.instanceNetwork();
            const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
            const localAddress: IpSocketAddress = {
                // invalid address family
                tag: "ipv6",
                val: {
                    address: [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0001],
                    port: 0,
                    flowInfo: 0,
                    scopeId: 0,
                },
            };
            throws(
                () => {
                    tcpSocket.startBind(network, localAddress);
                },
                (err) => err === "invalid-argument",
            );
        });

        test("tcp.bind(): should throw invalid-state when already bound", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");

            const network = sockets.instanceNetwork.instanceNetwork();
            const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
            const localAddress: IpSocketAddress = {
                tag: "ipv4",
                val: {
                    address: [0, 0, 0, 0],
                    port: 0,
                },
            };
            throws(
                () => {
                    tcpSocket.startBind(network, localAddress);
                    tcpSocket.finishBind();
                    // already bound
                    tcpSocket.startBind(network, localAddress);
                },
                (err) => err === "invalid-state",
            );
        });

        test("tcp.listen(): should listen to an ipv4 address", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const network = sockets.instanceNetwork.instanceNetwork();
            const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
            const localAddress: IpSocketAddress = {
                tag: "ipv4",
                val: {
                    address: [0, 0, 0, 0],
                    port: 0,
                },
            };

            tcpSocket.startBind(network, localAddress);
            tcpSocket.finishBind();
            tcpSocket.startListen();
            tcpSocket.finishListen();

            // const [socket, input, output] = tcpSocket.accept();
        });

        test("tcp.connect(): should preserve an explicitly bound local address", async () => {
            const server = createServer();
            const acceptedSockets = new Set<import("node:net").Socket>();
            server.on("connection", (socket) => {
                acceptedSockets.add(socket);
                socket.on("close", () => acceptedSockets.delete(socket));
            });
            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(0, "127.0.0.1", resolve);
            });
            const serverAddress = server.address();
            assert(serverAddress && typeof serverAddress !== "string");

            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const network = sockets.instanceNetwork.instanceNetwork();
            const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
            tcpSocket.startBind(network, {
                tag: "ipv4",
                val: { address: [127, 0, 0, 1], port: 0 },
            });
            tcpSocket.finishBind();
            const boundAddress = tcpSocket.localAddress();
            let connected = false;

            try {
                tcpSocket.startConnect(network, {
                    tag: "ipv4",
                    val: { address: [127, 0, 0, 1], port: serverAddress.port },
                });
                tcpSocket.subscribe().block();
                tcpSocket.finishConnect();
                connected = true;

                assert.deepStrictEqual(tcpSocket.localAddress(), boundAddress);
            } finally {
                if (connected) {
                    tcpSocket.shutdown("both");
                }
                for (const socket of acceptedSockets) {
                    socket.destroy();
                }
                await new Promise<void>((resolve, reject) => {
                    server.close((err) => (err ? reject(err) : resolve()));
                });
            }
        });

        test(
            "tcp.connect(): should connect to a valid ipv4 address and port=0",
            { retry: env.CI ? 3 : 0 },
            testWithGCWrap(async () => {
                const { lookup } = await import("node:dns");
                const { sockets } = await import("@bytecodealliance/preview2-shim");
                const network = sockets.instanceNetwork.instanceNetwork();
                const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");

                const pollable = tcpSocket.subscribe();

                const googleIp = await new Promise<string>((resolve, reject) =>
                    lookup("google.com", (err, result) => (err ? reject(err) : resolve(result))),
                );

                const ipParts = googleIp.split(".").map(Number) as Ipv4Address;
                tcpSocket.startConnect(network, {
                    tag: "ipv4",
                    val: {
                        address: ipParts,
                        port: 80,
                    },
                });

                assert(!pollable.ready());
                pollable.block();
                assert(pollable.ready());

                const [input, output] = tcpSocket.finishConnect();

                assert.strictEqual(tcpSocket.addressFamily(), "ipv4");

                assert.ok(pollable.ready());

                output.blockingWriteAndFlush(
                    new TextEncoder().encode("GET http://www.google.com/ HTTP/1.1\n\n"),
                );

                {
                    input.subscribe().block();
                    let buf = input.read(5000n);
                    while (buf.byteLength === 0) {
                        try {
                            buf = input.read(5000n);
                        } catch (e: any) {
                            if (e?.tag === "closed") {
                                break;
                            }
                            throw e?.val || e;
                        }
                    }
                    const responseBody = new TextDecoder().decode(buf);
                    assert.ok(responseBody.includes("<title>Google"));
                    assert.ok(responseBody.includes("<!doctype"));
                    assert.ok(responseBody.includes("<script"));
                }

                tcpSocket.shutdown("both");
            }),
        );
    });

    suite("WASI Sockets (UDP)", async () => {
        test("sockets.udpCreateSocket() should create sockets", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const socket1 = sockets.udpCreateSocket.createUdpSocket("ipv4");
            assert.notEqual(socket1, null);
            const socket2 = sockets.udpCreateSocket.createUdpSocket("ipv4");
            assert.notEqual(socket2, null);
        });

        // TODO: figure out how to mock handle.on("message", ...)
        test("udp.bind(): should bind to a valid ipv4 address and port=0", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const network = sockets.instanceNetwork.instanceNetwork();
            const socket = sockets.udpCreateSocket.createUdpSocket("ipv4");
            const localAddress: IpSocketAddress = {
                tag: "ipv4",
                val: {
                    address: [0, 0, 0, 0],
                    port: 0,
                },
            };

            socket.startBind(network, localAddress);
            socket.subscribe().block();
            socket.finishBind();

            const boundAddress = socket.localAddress();
            assert.strictEqual(boundAddress.tag, "ipv4");
            assert.deepStrictEqual(boundAddress.val.address, [0, 0, 0, 0]);
            assert.strictEqual(boundAddress.val.port > 0, true);
            assert.strictEqual(socket.addressFamily(), "ipv4");
        });

        test("udp.bind(): should bind to a valid ipv6 address and port=0", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const network = sockets.instanceNetwork.instanceNetwork();
            const socket = sockets.udpCreateSocket.createUdpSocket("ipv6");
            const localAddress = {
                tag: "ipv6" as const,
                val: {
                    address: [0, 0, 0, 0, 0, 0, 0, 0] as [
                        number,
                        number,
                        number,
                        number,
                        number,
                        number,
                        number,
                        number,
                    ],
                    port: 0,
                    flowInfo: 0,
                    scopeId: 0,
                },
            };
            socket.startBind(network, localAddress);
            socket.subscribe().block();
            socket.finishBind();

            const boundAddress = socket.localAddress();
            assert.strictEqual(boundAddress.tag, "ipv6");
            assert.deepStrictEqual(boundAddress.val.address, [0, 0, 0, 0, 0, 0, 0, 0]);
            assert.strictEqual(boundAddress.val.port > 0, true);
            assert.strictEqual(socket.addressFamily(), "ipv6");
        });

        test("udp.stream(): should connect to a valid ipv4 address", async () => {
            const { sockets } = await import("@bytecodealliance/preview2-shim");
            const network = sockets.instanceNetwork.instanceNetwork();
            const socket = sockets.udpCreateSocket.createUdpSocket("ipv4");
            const localAddress: IpSocketAddress = {
                tag: "ipv4",
                val: {
                    address: [0, 0, 0, 0],
                    port: 0,
                },
            };
            const remoteAddress: IpSocketAddress = {
                tag: "ipv4",
                val: {
                    address: [192, 168, 0, 1],
                    port: 80,
                },
            };

            socket.startBind(network, localAddress);
            socket.finishBind();
            const [incomingDatagrams, outgoingDatagrams] = socket.stream(remoteAddress);
            assert.ok(incomingDatagrams);
            assert.ok(outgoingDatagrams);
            assert.strictEqual(socket.addressFamily(), "ipv4");

            const boundAddress = socket.localAddress();

            assert.strictEqual(boundAddress.tag, "ipv4");
            assert.notDeepEqual(boundAddress.val.address, [0, 0, 0, 0]);
            assert.strictEqual(boundAddress.val.port > 0, true);
        });

        test(
            "udp.stream(): should connect to a valid ipv6 address",
            testWithGCWrap(async () => {
                const { sockets } = await import("@bytecodealliance/preview2-shim");
                const network = sockets.instanceNetwork.instanceNetwork();
                const socket = sockets.udpCreateSocket.createUdpSocket("ipv6");
                const localAddress: IpSocketAddress = {
                    tag: "ipv6",
                    val: {
                        address: [0, 0, 0, 0, 0, 0, 0, 0],
                        port: 1337,
                        flowInfo: 0,
                        scopeId: 0,
                    },
                };

                socket.startBind(network, localAddress);
                socket.finishBind();
                const [incomingDatagrams, outgoingDatagrams] = socket.stream(undefined);
                assert.ok(incomingDatagrams);
                assert.ok(outgoingDatagrams);
                assert.strictEqual(socket.addressFamily(), "ipv6");

                const boundAddress = socket.localAddress();
                assert.deepStrictEqual(boundAddress.val.address, [0, 0, 0, 0, 0, 0, 0, 0]);
                assert.strictEqual(boundAddress.val.port, 1337);
            }),
        );
    });

    suite("WASI Sockets (IP Name Lookup)", async () => {
        test(
            "ipNameLookup.resolveAddresses(): should return valid IP addresses",
            testWithGCWrap(async () => {
                const { sockets } = await import("@bytecodealliance/preview2-shim");

                const network = sockets.instanceNetwork.instanceNetwork();
                const stream = sockets.ipNameLookup.resolveAddresses(network, "localhost");

                const poll = stream.subscribe();
                poll.block();

                const addresses = stream.resolveNextAddress();
                if (!addresses) {
                    throw new Error("should resolve to at least one address");
                }
                const addressGroup: IpAddress[] = Array.isArray(addresses)
                    ? addresses
                    : [addresses];
                assert.ok(addressGroup.length, "should be an address group");
                const firstAddress = addressGroup[0];
                assert.ok(
                    firstAddress.tag === "ipv4" || firstAddress.tag === "ipv6",
                    "should be an IP address variant",
                );

                if (firstAddress.tag === "ipv4") {
                    assert.ok(Array.isArray(firstAddress.val), "ipv4 address should be a tuple");
                    assert.strictEqual(firstAddress.val.length, 4);
                } else {
                    assert.ok(Array.isArray(firstAddress.val), "ipv6 address should be a tuple");
                    assert.strictEqual(firstAddress.val.length, 8);
                }

                poll[symbolDispose]();
                stream[symbolDispose]();
            }),
        );
    });
});

suite("HTTPServer", () => {
    test(
        "HTTPServer: can retrieve randomized server address",
        testWithGCWrap(async () => {
            const httpModule = await import("@bytecodealliance/preview2-shim/http");
            const HTTPServer = (httpModule as any).HTTPServer;
            if (!HTTPServer) {
                console.log("HTTPServer not available in this environment, skipping test");
                return;
            }
            const server = new HTTPServer({
                handle() {
                    throw new Error("never called");
                },
            });
            server.listen(0);
            const address = server.address();
            assert(
                Number.isSafeInteger(address?.port) && address?.port != 0,
                "a random port was assigned and retrieved",
            );
        }),
    );
});

suite("Instantiation", () => {
    test("WASIShim export (random)", async () => {
        const { random } = await import("@bytecodealliance/preview2-shim");
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
        const shim = new WASIShim();
        assert.ok(shim);
        assert.deepStrictEqual(
            Object.keys(shim.getImportObject()["wasi:random/random"]).sort(),
            Object.keys(random.random).sort(),
        );
        assert.deepStrictEqual(
            Object.keys(shim.getImportObject()["wasi:random/insecure-seed"]).sort(),
            Object.keys(random.insecureSeed).sort(),
        );
        assert.deepStrictEqual(
            Object.keys(shim.getImportObject()["wasi:random/insecure"]).sort(),
            Object.keys(random.insecure).sort(),
        );
    });

    test("WASIShim export override", async () => {
        const { random } = await import("@bytecodealliance/preview2-shim");
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
        const invalidWASIShim = {
            random: {
                random: {
                    invalid: function setup() {},
                },
            },
        };
        const shim = new WASIShim(invalidWASIShim);
        assert.ok(shim);
        assert.notDeepEqual(
            Object.keys(shim.getImportObject()["wasi:random/random"]).sort(),
            Object.keys(random.random).sort(),
        );
        assert.strictEqual(shim.getImportObject()["wasi:random/insecure-seed"], undefined);
        assert.strictEqual(shim.getImportObject()["wasi:random/insecure"], undefined);
        assert.deepStrictEqual(
            Object.keys(shim.getImportObject()["wasi:random/random"]).sort(),
            Object.keys(invalidWASIShim.random.random).sort(),
        );
    });

    test("WASIShim accepts application-provided filesystem namespaces", async () => {
        const { filesystem } = await import("@bytecodealliance/preview2-shim");
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
        const customPreopens = { getDirectories: () => [] };
        const shim = new WASIShim({
            filesystem: {
                types: filesystem.types,
                preopens: customPreopens,
            },
        });
        const imports = shim.getImportObject();

        assert.strictEqual(imports["wasi:filesystem/types"], filesystem.types);
        assert.strictEqual(imports["wasi:filesystem/preopens"], customPreopens);
    });
});

suite("Sandboxing", () => {
    let originalEnv: [string, string][];
    let originalArgs: string[];

    beforeEach(async () => {
        const { cli } = await import("@bytecodealliance/preview2-shim");
        // Save original state
        originalEnv = cli.environment.getEnvironment() as [string, string][];
        originalArgs = cli.environment.getArguments();
    });

    afterEach(async () => {
        const { cli, filesystem } = await import("@bytecodealliance/preview2-shim");
        // Restore default state
        (filesystem as any)._setPreopens({ "/": "/" });
        cli._setEnv(Object.fromEntries(originalEnv));
        cli._setArgs(originalArgs);
    });

    test("_clearPreopens removes filesystem access", async () => {
        const { filesystem } = await import("@bytecodealliance/preview2-shim");
        const initialPreopens = filesystem.preopens.getDirectories();

        assert.ok(initialPreopens.length > 0, "Should have default preopens");
        filesystem._clearPreopens();

        const clearedPreopens = filesystem.preopens.getDirectories();
        assert.strictEqual(clearedPreopens.length, 0, "Preopens should be empty after clear");
    });

    test("_setPreopens replaces preopens", async () => {
        const { filesystem } = await import("@bytecodealliance/preview2-shim");

        (filesystem as any)._setPreopens({
            "/custom": "/tmp",
        });

        const preopens = filesystem.preopens.getDirectories();
        assert.strictEqual(preopens.length, 1, "Should have exactly one preopen");
        assert.strictEqual(preopens[0][1], "/custom", "Virtual path should be /custom");
    });

    test("_getPreopens returns current preopens", async () => {
        const { filesystem } = await import("@bytecodealliance/preview2-shim");

        const preopens = filesystem._getPreopens();
        assert.ok(Array.isArray(preopens), "Should return an array");
        // The returned array should be a copy
        preopens.push([{} as any, "/fake"]);
        const preopensAfter = filesystem._getPreopens();
        assert.notStrictEqual(preopens.length, preopensAfter.length, "Should return a copy");
    });

    test("WASIShim with empty preopens provides no filesystem access", async () => {
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

        const sandboxedShim = new WASIShim({
            sandbox: {
                preopens: {},
            },
        });

        const importObj = sandboxedShim.getImportObject();
        const dirs = importObj["wasi:filesystem/preopens"].getDirectories();
        assert.strictEqual(dirs.length, 0, "Should have no preopens");
    });

    test("WASIShim with custom env", async () => {
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

        const customShim = new WASIShim({
            sandbox: {
                env: { CUSTOM_VAR: "custom_value", ANOTHER: "value2" },
            },
        });

        const importObj = customShim.getImportObject();
        const env = importObj["wasi:cli/environment"].getEnvironment();
        assert.deepStrictEqual(env, [
            ["CUSTOM_VAR", "custom_value"],
            ["ANOTHER", "value2"],
        ]);
    });

    test("WASIShim with custom args", async () => {
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

        const customShim = new WASIShim({
            sandbox: {
                args: ["program", "--flag", "value"],
            },
        });

        const importObj = customShim.getImportObject();
        const args = importObj["wasi:cli/environment"].getArguments();
        assert.deepStrictEqual(args, ["program", "--flag", "value"]);
    });

    test("WASIShim with enableNetwork=false denies network", async () => {
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

        const noNetworkShim = new WASIShim({
            sandbox: {
                enableNetwork: false,
            },
        });

        const importObj = noNetworkShim.getImportObject();

        // TCP socket can be created, but operations are denied
        const tcpSocket = importObj["wasi:sockets/tcp-create-socket"].createTcpSocket("ipv4");
        const network = importObj["wasi:sockets/instance-network"].instanceNetwork();

        // Bind should throw access-denied
        assert.throws(() => {
            tcpSocket.startBind(network, {
                tag: "ipv4",
                val: { address: [127, 0, 0, 1], port: 0 },
            });
        }, /access-denied/);

        // UDP socket can be created, but operations are denied
        const udpSocket = importObj["wasi:sockets/udp-create-socket"].createUdpSocket("ipv4");

        // Bind should throw access-denied
        assert.throws(() => {
            udpSocket.startBind(network, {
                tag: "ipv4",
                val: { address: [127, 0, 0, 1], port: 0 },
            });
        }, /access-denied/);
    });

    test("WASIShim with enableNetwork=true (default) allows network", async () => {
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
        const { sockets } = await import("@bytecodealliance/preview2-shim");

        const defaultShim = new WASIShim();

        const importObj = defaultShim.getImportObject();

        // Should have the real implementations
        assert.strictEqual(
            importObj["wasi:sockets/tcp-create-socket"].createTcpSocket,
            sockets.tcpCreateSocket.createTcpSocket,
        );
        assert.strictEqual(
            importObj["wasi:sockets/udp-create-socket"].createUdpSocket,
            sockets.udpCreateSocket.createUdpSocket,
        );
    });

    test("Fully sandboxed WASIShim", async () => {
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

        const sandboxed = new WASIShim({
            sandbox: {
                preopens: {},
                env: {},
                args: ["sandboxed-program"],
                enableNetwork: false,
            },
        });

        const importObj = sandboxed.getImportObject();

        // Verify all restrictions
        assert.strictEqual(
            importObj["wasi:filesystem/preopens"].getDirectories().length,
            0,
            "No filesystem access",
        );
        assert.deepStrictEqual(
            importObj["wasi:cli/environment"].getEnvironment(),
            [],
            "No environment variables",
        );
        assert.deepStrictEqual(
            importObj["wasi:cli/environment"].getArguments(),
            ["sandboxed-program"],
            "Custom arguments",
        );

        // Network operations should be denied
        const tcpSocket = importObj["wasi:sockets/tcp-create-socket"].createTcpSocket("ipv4");
        const network = importObj["wasi:sockets/instance-network"].instanceNetwork();
        assert.throws(
            () => {
                tcpSocket.startBind(network, {
                    tag: "ipv4",
                    val: { address: [127, 0, 0, 1], port: 0 },
                });
            },
            /access-denied/,
            "No network access",
        );
    });

    test("Multiple WASIShim instances have isolated preopens", async () => {
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

        // Create two shims with different preopens
        const shim1 = new WASIShim({
            sandbox: {
                preopens: { "/a": "/tmp/a" },
            },
        });
        const shim2 = new WASIShim({
            sandbox: {
                preopens: { "/b": "/tmp/b" },
            },
        });

        const obj1 = shim1.getImportObject();
        const obj2 = shim2.getImportObject();

        const dirs1 = obj1["wasi:filesystem/preopens"].getDirectories();
        const dirs2 = obj2["wasi:filesystem/preopens"].getDirectories();

        assert.strictEqual(dirs1.length, 1, "shim1 should have 1 preopen");
        assert.strictEqual(dirs2.length, 1, "shim2 should have 1 preopen");
        assert.strictEqual(dirs1[0][1], "/a", "shim1 should have /a");
        assert.strictEqual(dirs2[0][1], "/b", "shim2 should have /b");

        // They should not affect each other
        assert.notStrictEqual(dirs1, dirs2, "Should be different arrays");
    });

    test("Multiple WASIShim instances have isolated env and args", async () => {
        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

        const shim1 = new WASIShim({
            sandbox: {
                env: { VAR: "value1" },
                args: ["prog1"],
            },
        });
        const shim2 = new WASIShim({
            sandbox: {
                env: { VAR: "value2" },
                args: ["prog2"],
            },
        });

        const obj1 = shim1.getImportObject();
        const obj2 = shim2.getImportObject();

        const env1 = obj1["wasi:cli/environment"].getEnvironment();
        const env2 = obj2["wasi:cli/environment"].getEnvironment();
        const args1 = obj1["wasi:cli/environment"].getArguments();
        const args2 = obj2["wasi:cli/environment"].getArguments();

        assert.deepStrictEqual(env1, [["VAR", "value1"]], "shim1 env");
        assert.deepStrictEqual(env2, [["VAR", "value2"]], "shim2 env");
        assert.deepStrictEqual(args1, ["prog1"], "shim1 args");
        assert.deepStrictEqual(args2, ["prog2"], "shim2 args");
    });

    test(
        "WASIShim isolated preopens can read files",
        testWithGCWrap(async () => {
            const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
            const { dirname } = await import("node:path");

            const testFilePath = fileURLToPath(import.meta.url);
            const testDir = dirname(testFilePath);
            const testFileName = "test.ts";

            // Create a shim with preopens pointing to the test directory
            const shim = new WASIShim({
                sandbox: {
                    preopens: { "/test": testDir },
                },
            });

            const importObj = shim.getImportObject();
            const preopens = importObj["wasi:filesystem/preopens"];
            const dirs = preopens.getDirectories();

            assert.strictEqual(dirs.length, 1, "Should have one preopen");
            assert.strictEqual(dirs[0][1], "/test", "Virtual path should be /test");

            const [rootDescriptor] = dirs[0];

            // Open and read the test file
            const childDescriptor = rootDescriptor.openAt({}, testFileName, {}, { read: true });

            const stream = childDescriptor.readViaStream(0n);
            const poll = stream.subscribe();
            poll.block();
            let buf = stream.read(10000n);
            while (buf.byteLength === 0) {
                buf = stream.read(10000n);
            }
            const source = new TextDecoder().decode(buf);

            // Verify we read the actual test file content
            assert.ok(source.includes("UNIQUE STRING"), "Should read file content");

            // Dispose in correct order: poll first, then stream, then descriptor
            poll[symbolDispose]();
            stream[symbolDispose]();
            childDescriptor[symbolDispose]();
        }),
    );

    test(
        "WASIShim isolated preopens don't access paths outside preopen",
        testWithGCWrap(async () => {
            const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
            const { dirname } = await import("node:path");

            const testFilePath = fileURLToPath(import.meta.url);
            const testDir = dirname(testFilePath);

            // Create a shim with limited preopens
            const shim = new WASIShim({
                sandbox: {
                    preopens: { "/test": testDir },
                },
            });

            const importObj = shim.getImportObject();
            const [rootDescriptor] = importObj["wasi:filesystem/preopens"].getDirectories()[0];

            // Attempting to traverse outside the preopen should fail
            assert.throws(
                () => {
                    rootDescriptor.openAt({}, "../package.json", {}, { read: true });
                },
                /not-permitted/,
                "Should not allow traversing outside preopen",
            );
        }),
    );
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

        assert.deepStrictEqual(poll.poll([first, second, first]), new Uint32Array([1]));
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

    test("browser outgoing HTTP waits for the complete request body", async () => {
        const { outgoingHandler, types } = await import("../src/browser/http.js");
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
});

function testWithGCWrap(asyncTestFn: any) {
    return async () => {
        await asyncTestFn();
        // @ts-expect-error Force the JS GC to run finalizers
        gc();
        await new Promise((resolve) => setTimeout(resolve, 200));
    };
}
