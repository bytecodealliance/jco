import { deepEqual, equal, ok, throws, strictEqual, notEqual } from "node:assert";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";

suite("Node.js Preview2", () => {
  test("Stdio", async () => {
    const { cli } = await import("@bytecodealliance/preview2-shim");
    // todo: wrap in a process call to not spill to test output
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

  suite("Sockets::TCP", async () => {
    test("sockets.instanceNetwork() should be a singleton", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network1 = sockets.instanceNetwork.instanceNetwork();
      equal(network1.id, 1);
      const network2 = sockets.instanceNetwork.instanceNetwork();
      equal(network2.id, 1);
    });

    test("sockets.tcpCreateSocket()", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const socket = sockets.tcpCreateSocket.createTcpSocket(sockets.network.IpAddressFamily.ipv4);
      notEqual(socket, null);

      throws(
        () => {
          sockets.tcpCreateSocket.createTcpSocket("abc");
        },
        {
          name: "Error",
          code: sockets.network.errorCode.notSupported,
        }
      );
    });
    test("tcp.bind(): should bind to a valid ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(sockets.network.IpAddressFamily.ipv4);
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      tcpSocket.startBind(network, localAddress);
      tcpSocket.finishBind();

      equal(tcpSocket.network.id, network.id);
      deepEqual(tcpSocket.localAddress(), {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      });
      equal(tcpSocket.addressFamily(), "ipv4");
    });

    test("tcp.bind(): should bind to a valid ipv6 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(sockets.network.IpAddressFamily.ipv6);
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 0,
        },
      };
      tcpSocket.startBind(network, localAddress);
      tcpSocket.finishBind();

      equal(tcpSocket.network.id, network.id);
      equal(tcpSocket.addressFamily(), "ipv6");
      deepEqual(tcpSocket.localAddress(), {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 0,
        },
      });
    });

    test("tcp.bind(): should throw invalid-argument", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");

      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(sockets.network.IpAddressFamily.ipv4);
      const localAddress = {
        // invalid address family
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0001],
          port: 0,
        },
      };
      throws(
        () => {
          tcpSocket.startBind(network, localAddress);
        },
        {
          code: "invalid-argument",
        }
      );
    });

    test("tcp.bind(): should throw invalid-state", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");

      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(sockets.network.IpAddressFamily.ipv4);
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
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
        {
          code: "invalid-state",
        }
      );
    });

    test("tcp.listen(): should listen to an ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(sockets.network.IpAddressFamily.ipv4);
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };

      mock.method(tcpSocket.server(), "listen", () => {
        console.log("mock listen called");
      });

      tcpSocket.startBind(network, localAddress);
      tcpSocket.finishBind();
      tcpSocket.startListen();
      tcpSocket.finishListen();

      strictEqual(tcpSocket.server().listen.mock.calls.length, 1);

      mock.reset();
    });

    test("tcp.connect(): should connect to a valid ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket(sockets.network.IpAddressFamily.ipv4);

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

      mock.method(tcpSocket.client(), "connect", () => {
        console.log("mock connect called");
      });

      tcpSocket.startBind(network, localAddress);
      tcpSocket.finishBind();
      tcpSocket.startConnect(network, remoteAddress);
      tcpSocket.finishConnect();

      strictEqual(tcpSocket.client().connect.mock.calls.length, 1);

      equal(tcpSocket.network.id, network.id);
      equal(tcpSocket.addressFamily(), "ipv4");
      deepEqual(tcpSocket.localAddress(), {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      });
    });
  });

  suite("Sockets::UDP", async () => {
    test("sockets.udpCreateSocket()", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const socket = sockets.udpCreateSocket.createUdpSocket(sockets.network.IpAddressFamily.ipv4);
      notEqual(socket, null);

      throws(
        () => {
          sockets.udpCreateSocket.createUdpSocket("xyz");
        },
        {
          name: "Error",
          code: sockets.network.errorCode.notSupported,
        }
      );
    });
    test("udp.bind(): should bind to a valid ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const socket = sockets.udpCreateSocket.createUdpSocket(sockets.network.IpAddressFamily.ipv4);
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      socket.startBind(network, localAddress);
      socket.finishBind();

      equal(socket.network.id, network.id);
      deepEqual(socket.localAddress(), {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      });
      equal(socket.addressFamily(), "ipv4");
    });
    test("udp.connect(): should connect to a valid ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const socket = sockets.udpCreateSocket.createUdpSocket(sockets.network.IpAddressFamily.ipv4);
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

      mock.method(socket.client(), "connect", () => {
        console.log("mock connect called");
      });

      socket.startBind(network, localAddress);
      socket.finishBind();
      socket.startConnect(network, remoteAddress);
      socket.finishConnect();

      strictEqual(socket.client().connect.mock.calls.length, 1);

      equal(socket.network.id, network.id);
      equal(socket.addressFamily(), "ipv4");
      deepEqual(socket.localAddress(), {
        tag: sockets.network.IpAddressFamily.ipv4,
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      });
    });
  });
});
