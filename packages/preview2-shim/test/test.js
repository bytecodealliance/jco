import {
  deepStrictEqual,
  notEqual,
  ok,
  strictEqual,
  throws,
} from "node:assert";
import { fileURLToPath } from "node:url";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

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
      // strictEqual(typeof curNow, "bigint");
      // ok(monotonicClock.now() > curNow);
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
      fileURLToPath(import.meta.url).slice(1),
      {},
      {}
    );
    const stream = childDescriptor.readViaStream(0);
    const poll = stream.subscribe();
    poll.block();
    let buf = stream.read(10000n);
    while (buf.byteLength === 0) buf = stream.read(10000n);
    const source = new TextDecoder().decode(buf);
    ok(source.includes("UNIQUE STRING"));
    poll[Symbol.dispose]();
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
      while (buf.byteLength === 0) {
        try {
          buf = bodyStream.read(5000n);
        } catch (e) {
          if (e.tag === "closed") break;
          throw e.val || e;
        }
      }
      responseBody = new TextDecoder().decode(buf);
    }

    strictEqual(status, 200);
    ok(headers["content-type"].startsWith("text/html"));
    ok(responseBody.includes("WebAssembly"));
  });

  suite("WASI Sockets (TCP)", async () => {
    test("sockets.instanceNetwork() should be a singleton", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network1 = sockets.instanceNetwork.instanceNetwork();
      const network2 = sockets.instanceNetwork.instanceNetwork();
      strictEqual(network1, network2);
    });

    test("sockets.tcpCreateSocket() should throw not-supported", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const socket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
      notEqual(socket, null);

      throws(
        () => {
          sockets.tcpCreateSocket.createTcpSocket("abc");
        },
        (err) => err === "not-supported"
      );
    });
    test("tcp.bind(): should bind to a valid ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
      const localAddress = {
        tag: "ipv4",
        val: {
          address: [0, 0, 0, 0],
          port: 1337,
        },
      };
      tcpSocket.startBind(network, localAddress);
      tcpSocket.finishBind();

      deepStrictEqual(tcpSocket.localAddress(), {
        tag: "ipv4",
        val: {
          address: [0, 0, 0, 0],
          port: 1337,
        },
      });
      strictEqual(tcpSocket.addressFamily(), "ipv4");
    });

    test("tcp.bind(): should bind to a valid ipv6 address and port=0", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv6");
      const localAddress = {
        tag: "ipv6",
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 0,
        },
      };
      tcpSocket.startBind(network, localAddress);
      tcpSocket.finishBind();

      strictEqual(tcpSocket.addressFamily(), "ipv6");

      const boundAddress = tcpSocket.localAddress();
      const expectedAddress = {
        tag: "ipv6",
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          // port will be assigned by the OS, so it should be > 0
          // port: 0,
        },
      };

      strictEqual(boundAddress.tag, expectedAddress.tag);
      deepStrictEqual(boundAddress.val.address, expectedAddress.val.address);
      strictEqual(boundAddress.val.port > 0, true);
    });

    test("tcp.bind(): should throw invalid-argument when invalid address family", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");

      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
      const localAddress = {
        // invalid address family
        tag: "ipv6",
        val: {
          address: [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0001],
          port: 0,
        },
      };
      throws(
        () => {
          tcpSocket.startBind(network, localAddress);
        },
        (err) => err === "invalid-argument"
      );
    });

    test("tcp.bind(): should throw invalid-state when already bound", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");

      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
      const localAddress = {
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
        (err) => err === "invalid-state"
      );
    });

    test("tcp.listen(): should listen to an ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");
      const localAddress = {
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

    test("tcp.connect(): should connect to a valid ipv4 address and port=0", async () => {
      const { lookup } = await import("node:dns");
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");

      const pollable = tcpSocket.subscribe();

      const googleIp = await new Promise((resolve) =>
        lookup("google.com", (_err, result) => resolve(result))
      );

      tcpSocket.startConnect(network, {
        tag: "ipv4",
        val: {
          address: googleIp.split("."),
          port: 80,
        },
      });

      ok(!pollable.ready());

      const [input, output] = tcpSocket.finishConnect();

      strictEqual(tcpSocket.addressFamily(), "ipv4");

      ok(pollable.ready());

      output.blockingWriteAndFlush(
        new TextEncoder().encode("GET http://www.google.com/ HTTP/1.1\n\n")
      );

      {
        input.subscribe().block();
        let buf = input.read(5000n);
        while (buf.byteLength === 0) {
          try {
            buf = input.read(5000n);
          } catch (e) {
            if (e.tag === "closed") break;
            throw e.val || e;
          }
        }
        const responseBody = new TextDecoder().decode(buf);
        ok(responseBody.includes("<title>Google"));
        ok(responseBody.includes("<!doctype"));
        ok(responseBody.includes("<script"));
      }

      tcpSocket.shutdown("both");
      deepStrictEqual(
        tcpSocket.remoteAddress().val.address,
        googleIp.split(".").map((n) => Number(n))
      );
    });
  });

  suite("WASI Sockets (UDP)", async () => {
    test("sockets.udpCreateSocket() should be a singleton", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const socket1 = sockets.udpCreateSocket.createUdpSocket("ipv4");
      notEqual(socket1.id, 1);
      const socket2 = sockets.udpCreateSocket.createUdpSocket("ipv4");
      notEqual(socket2.id, 1);
    });

    // TODO: figure out how to mock handle.on("message", ...)
    test.skip("udp.bind(): should bind to a valid ipv4 address and port=0", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const socket = sockets.udpCreateSocket.createUdpSocket("ipv4");
      const localAddress = {
        tag: "ipv4",
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      socket.startBind(network, localAddress);
      socket.finishBind();

      stricteEqual(socket.network.id, network.id);

      const boundAddress = socket.localAddress();
      const expectedAddress = {
        tag: "ipv4",
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      strictEqual(boundAddress.tag, expectedAddress.tag);
      deepStrictEqual(boundAddress.val.address, expectedAddress.val.address);
      strictEqual(boundAddress.val.port > 0, true);
      strictEqual(socket.addressFamily(), "ipv4");
    });

    // TODO: figure out how to mock handle.on("message", ...)
    test.skip("udp.bind(): should bind to a valid ipv6 address and port=0", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const socket = sockets.udpCreateSocket.createUdpSocket(
        sockets.network.IpAddressFamily.ipv6
      );
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 0,
        },
      };
      socket.startBind(network, localAddress);
      socket.finishBind();

      strictEqual(socket.network.id, network.id);

      const boundAddress = socket.localAddress();
      const expectedAddress = {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          // port will be assigned by the OS, so it should be > 0
          // port: 0,
        },
      };
      strictEqual(boundAddress.tag, expectedAddress.tag);
      deepStrictEqual(boundAddress.val.address, expectedAddress.val.address);
      strictEqual(boundAddress.val.port > 0, true);
      strictEqual(socket.addressFamily(), "ipv6");
    });

    // TODO: figure out how to mock handle.connect()
    test.skip("udp.stream(): should connect to a valid ipv4 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const socket = sockets.udpCreateSocket.createUdpSocket("ipv4");
      const localAddress = {
        tag: "ipv4",
        val: {
          address: [0, 0, 0, 0],
          port: 0,
        },
      };
      const remoteAddress = {
        tag: "ipv4",
        val: {
          address: [192, 168, 0, 1],
          port: 80,
        },
      };

      socket.startBind(network, localAddress);
      socket.finishBind();
      socket.stream(remoteAddress);

      strictEqual(socket._handle.connect.mock.calls.length, 1);

      strictEqual(socket.network.id, network.id);
      strictEqual(socket.addressFamily(), "ipv4");

      const boundAddress = socket.localAddress();
      const expectedAddress = {
        tag: "ipv4",
        val: {
          address: [0, 0, 0, 0],
          // port will be assigned by the OS, so it should be > 0
          // port: 0,
        },
      };

      strictEqual(boundAddress.tag, expectedAddress.tag);
      deepStrictEqual(boundAddress.val.address, expectedAddress.val.address);
      strictEqual(boundAddress.val.port > 0, true);
    });

    // TODO: figure out how to mock handle.on("message", ...)
    test.skip("udp.stream(): should connect to a valid ipv6 address", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const network = sockets.instanceNetwork.instanceNetwork();
      const socket = sockets.udpCreateSocket.createUdpSocket(
        sockets.network.IpAddressFamily.ipv6
      );
      const localAddress = {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 1337,
        },
      };
      const remoteAddress = {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 1336,
        },
      };

      socket.startBind(network, localAddress);
      socket.finishBind();
      socket.stream(remoteAddress);

      strictEqual(socket.handle().connect.mock.calls.length, 1);

      strictEqual(socket.network.id, network.id);
      strictEqual(socket.addressFamily(), "ipv6");
      deepStrictEqual(socket.localAddress(), {
        tag: sockets.network.IpAddressFamily.ipv6,
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 1337,
        },
      });
    });
  });
});
