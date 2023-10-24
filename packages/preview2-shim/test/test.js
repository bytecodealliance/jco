import { deepEqual, equal, ok, throws, strictEqual } from "node:assert";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";

suite("Node.js Preview2", () => {
  test("Stdio", async () => {
    const { cli } = await import("@bytecodealliance/preview2-shim");
    // todo: wrap in a process call to not spill to test output
    cli.stdout
      .getStdout()
      .blockingWriteAndFlush(new TextEncoder().encode("test stdout"));
    cli.stderr
      .getStderr()
      .blockingWriteAndFlush(new TextEncoder().encode("test stderr"));
  });

  suite("Clocks", () => {
    test("Wall clock", async () => {
      const {
        clocks: { wallClock },
      } = await import("@bytecodealliance/preview2-shim");

      {
        const { seconds, nanoseconds } = wallClock.now();
        strictEqual(typeof seconds, "bigint");
        strictEqual(typeof nanoseconds, "number");
      }

      {
        const { seconds, nanoseconds } = wallClock.resolution();
        strictEqual(typeof seconds, "bigint");
        strictEqual(typeof nanoseconds, "number");
      }
    });

    test("Monotonic clock now", async () => {
      const {
        clocks: { monotonicClock },
      } = await import("@bytecodealliance/preview2-shim");

      strictEqual(typeof monotonicClock.resolution(), "bigint");
      const curNow = monotonicClock.now();
      strictEqual(typeof curNow, "bigint");
      ok(monotonicClock.now() > curNow);
    });

    test("Monotonic clock immediately resolved polls", async () => {
      const {
        clocks: { monotonicClock },
      } = await import("@bytecodealliance/preview2-shim");
      const curNow = monotonicClock.now();
      {
        const poll = monotonicClock.subscribeInstant(curNow - 10n);
        ok(poll.ready());
      }
      {
        const poll = monotonicClock.subscribeDuration(0n);
        ok(poll.ready());
      }
    });

    test("Monotonic clock subscribe duration", async () => {
      const {
        clocks: { monotonicClock },
      } = await import("@bytecodealliance/preview2-shim");

      const curNow = monotonicClock.now();

      const poll = monotonicClock.subscribeDuration(10e6);
      poll.block();

      // verify we are at the right time, and within 1ms of the original now
      const nextNow = monotonicClock.now();
      ok(nextNow - curNow >= 10e6);
      ok(nextNow - curNow < 15e6);
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
      ok(nextNow - curNow >= 10e6);
      ok(nextNow - curNow < 15e6);
    });
  });

  test("FS read", async () => {
    const { filesystem } = await import("@bytecodealliance/preview2-shim");
    const [[rootDescriptor]] = filesystem.preopens.getDirectories();
    const childDescriptor = rootDescriptor.openAt(
      {},
      fileURLToPath(import.meta.url),
      {},
      {}
    );
    const stream = childDescriptor.readViaStream(0);
    stream.subscribe().block();
    let buf = stream.read(10000n);
    while (buf.byteLength === 0)
      buf = stream.read(10000n);
    const source = new TextDecoder().decode(buf);
    ok(source.includes("UNIQUE STRING"));
    stream[Symbol.dispose]();
    childDescriptor[Symbol.dispose]();
  });

  test("WASI HTTP", async () => {
    const { http } = await import("@bytecodealliance/preview2-shim");
    const { handle } = http.outgoingHandler;
    const { OutgoingRequest, OutgoingBody, Fields } = http.types;
    const encoder = new TextEncoder();
    const request = new OutgoingRequest(
      new Fields([
        ["User-agent", encoder.encode("WASI-HTTP/0.0.1")],
        ["Content-type", encoder.encode("application/json")],
      ])
    );
    request.setPathWithQuery("/");
    request.setAuthority("webassembly.org");
    request.setScheme({ tag: "HTTPS" });

    const outgoingBody = request.body();
    // TODO: we should explicitly drop the bodyStream here
    //       when we have support for Symbol.dispose
    OutgoingBody.finish(outgoingBody);

    const futureIncomingResponse = handle(request);
    futureIncomingResponse.subscribe().block();
    const incomingResponse = futureIncomingResponse.get().val.val;

    const status = incomingResponse.status();
    const responseHeaders = incomingResponse.headers().entries();

    const decoder = new TextDecoder();
    const headers = Object.fromEntries(
      responseHeaders.map(([k, v]) => [k, decoder.decode(v)])
    );

    let responseBody;
    const incomingBody = incomingResponse.consume();
    {
      const bodyStream = incomingBody.stream();
      bodyStream.subscribe().block();
      let buf = bodyStream.read(5000n);
      while (buf.byteLength === 0)
        buf = bodyStream.read(5000n);
      responseBody = new TextDecoder().decode(buf);
    }

    strictEqual(status, 200);
    ok(headers["content-type"].startsWith("text/html"));
    ok(responseBody.includes("WebAssembly"));
  });

  suite("Sockets", async () => {
    test("sockets.instanceNetwork() should be a singleton", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network1 = sockets.instanceNetwork.instanceNetwork();
      equal(network1.id, 1);
      const network2 = sockets.instanceNetwork.instanceNetwork();
      equal(network2.id, 1);
    });

    test("sockets.dropNetwork()", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const net = sockets.instanceNetwork.instanceNetwork();

      // drop existing network
      const op1 = sockets.network.dropNetwork(net.id);
      equal(op1, true);

      // drop non-existing network
      const op2 = sockets.network.dropNetwork(99999);
      equal(op2, false);
    });

    test("sockets.tcpCreateSocket()", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const { id } = sockets.tcpCreateSocket.createTcpSocket(
        sockets.network.IpAddressFamily.ipv4
      );
      equal(id, 1);

      throws(
        () => {
          sockets.tcpCreateSocket.createTcpSocket("abc");
        },
        {
          name: "Error",
          message: sockets.network.errorCode.addressFamilyNotSupported,
        }
      );
    });
    test("tcp.bind(): should bind to a valid ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(
        sockets.network.IpAddressFamily.ipv4
      );
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      tcpSocket.startBind(tcpSocket, network, localAddress);
      tcpSocket.finishBind(tcpSocket);

      equal(tcpSocket.network.id, network.id);
      deepEqual(tcpSocket.localAddress(tcpSocket), {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      });
      equal(tcpSocket.addressFamily(tcpSocket), "ipv4");
    });

    test("tcp.bind(): should bind to a valid ipv6 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(
        sockets.network.IpAddressFamily.ipv6
      );
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0001],
          port: 0,
        },
      };
      tcpSocket.startBind(tcpSocket, network, localAddress);
      tcpSocket.finishBind(tcpSocket);

      equal(tcpSocket.network.id, network.id);
      equal(tcpSocket.addressFamily(tcpSocket), "ipv6");
      deepEqual(tcpSocket.localAddress(tcpSocket), {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0001],
          port: 0,
        },
      });
    });

    test("tcp.bind(): should throw address-family-mismatch", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");

      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(
        sockets.network.IpAddressFamily.ipv4
      );
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0001],
          port: 0,
        },
      };
      throws(
        () => {
          tcpSocket.startBind(tcpSocket, network, localAddress);
        },
        {
          name: "Error",
          message: "address-family-mismatch",
        }
      );
    });

    test("tcp.bind(): should throw already-bound", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");

      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(
        sockets.network.IpAddressFamily.ipv4
      );
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      throws(
        () => {
          tcpSocket.startBind(tcpSocket, network, localAddress);
          tcpSocket.finishBind(tcpSocket);
          tcpSocket.startBind(tcpSocket, network, localAddress);
        },
        {
          name: "Error",
          message: "already-bound",
        }
      );
    });

    test("tcp.connect(): should connect to a valid ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(
        sockets.network.IpAddressFamily.ipv4
      );
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      const remoteAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [192, 168, 0, 1],
          port: 80,
        },
      };

      tcpSocket.startBind(tcpSocket, network, localAddress);
      tcpSocket.finishBind(tcpSocket);
      tcpSocket.startConnect(tcpSocket, network, remoteAddress);
      tcpSocket.finishConnect(tcpSocket);

      equal(tcpSocket.network.id, network.id);
      equal(tcpSocket.addressFamily(tcpSocket), "ipv4");
      deepEqual(tcpSocket.localAddress(tcpSocket), {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      });
    });

    test("tcp.listen(): should listen to an ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(
        sockets.network.IpAddressFamily.ipv4
      );
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      const remoteAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };

      mock.method(tcpSocket.server(), "listen", () => {
        console.log("listen called");
      });
      mock.method(tcpSocket.client(), "connect", () => {
        console.log("connect called");
      });

      tcpSocket.startBind(tcpSocket, network, localAddress);
      tcpSocket.finishBind(tcpSocket);
      tcpSocket.startConnect(tcpSocket, network, remoteAddress);
      tcpSocket.finishConnect(tcpSocket);
      tcpSocket.startListen(tcpSocket);
      tcpSocket.finishListen(tcpSocket);

      strictEqual(tcpSocket.server().listen.mock.calls.length, 1);
      strictEqual(tcpSocket.client().connect.mock.calls.length, 1);

      mock.reset();
    });
  });
});
