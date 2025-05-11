import {
  throws
} from "node:assert";
import { fileURLToPath } from "node:url";

import { suite, test, assert } from "vitest";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

suite("Node.js Preview2", () => {
  test("Stdio", async () => {
    const { cli } = await import("@bytecodealliance/preview2-shim");
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

      const poll = monotonicClock.subscribeDuration(10e6);
      poll.block();

      // verify we are at the right time, and within 1ms of the original now
      const nextNow = monotonicClock.now();
      assert.ok(nextNow - curNow >= 10e6);
      assert.ok(nextNow - curNow < 15e6);
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
      assert.ok(nextNow - curNow >= 10e6);
      assert.ok(nextNow - curNow < 15e6);
    });
  });

  test("FS read", async () => {
    let toDispose = [];
    await (async () => {
      const { filesystem } = await import("@bytecodealliance/preview2-shim");
      const [[rootDescriptor]] = filesystem.preopens.getDirectories();
      const childDescriptor = rootDescriptor.openAt(
        {},
        fileURLToPath(import.meta.url).slice(1),
        {},
        {},
      );
      const stream = childDescriptor.readViaStream(0);
      const poll = stream.subscribe();
      poll.block();
      let buf = stream.read(10000n);
      while (buf.byteLength === 0) buf = stream.read(10000n);
      const source = new TextDecoder().decode(buf);
      assert.ok(source.includes("UNIQUE STRING"));
      toDispose.push(stream);
      toDispose.push(childDescriptor);
    })();

    // Force the Poll to GC so the next dispose doesn't trap
    gc();
    await new Promise((resolve) => setTimeout(resolve, 200));

    for (const item of toDispose) {
      item[symbolDispose]();
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
        new Fields([
          ["User-agent", encoder.encode("WASI-HTTP/0.0.1")],
          ["Content-type", encoder.encode("application/json")],
        ]),
      );
      request.setPathWithQuery("/");
      request.setAuthority("webassembly.org");
      request.setScheme({ tag: "HTTPS" });

      const outgoingBody = request.body();
      OutgoingBody.finish(outgoingBody);

      const futureIncomingResponse = handle(request);
      futureIncomingResponse.subscribe().block();
      const incomingResponseResult = futureIncomingResponse.get().val;

      if (incomingResponseResult.tag !== "ok") {
        throw incomingResponseResult.val;
      }

      const status = incomingResponseResult.val.status();
      const responseHeaders = incomingResponseResult.val.headers().entries();

      const decoder = new TextDecoder();
      const headers = Object.fromEntries(
        responseHeaders.map(([k, v]) => [k, decoder.decode(v)]),
      );

      let responseBody;
      const incomingBody = incomingResponseResult.val.consume();
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
          sockets.tcpCreateSocket.createTcpSocket("abc");
        },
        (err) => err === "not-supported",
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
      const localAddress = {
        tag: "ipv6",
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 0,
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
        (err) => err === "invalid-argument",
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
        (err) => err === "invalid-state",
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

    test(
      "tcp.connect(): should connect to a valid ipv4 address and port=0",
      testWithGCWrap(async () => {
        const { lookup } = await import("node:dns");
        const { sockets } = await import("@bytecodealliance/preview2-shim");
        const network = sockets.instanceNetwork.instanceNetwork();
        const tcpSocket = sockets.tcpCreateSocket.createTcpSocket("ipv4");

        const pollable = tcpSocket.subscribe();

        const googleIp = await new Promise((resolve, reject) =>
          lookup("google.com", (err, result) =>
            err ? reject(err) : resolve(result),
          ),
        );

        tcpSocket.startConnect(network, {
          tag: "ipv4",
          val: {
            address: googleIp.split("."),
            port: 80,
          },
        });

        assert.ok(!pollable.ready());
        pollable.block();
        assert.ok(pollable.ready());

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
            } catch (e) {
              if (e.tag === "closed") break;
              throw e.val || e;
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
    test("sockets.udpCreateSocket() should be a singleton", async () => {
      const { sockets } = await import("@bytecodealliance/preview2-shim");
      const socket1 = sockets.udpCreateSocket.createUdpSocket("ipv4");
      assert.notEqual(socket1.id, 1);
      const socket2 = sockets.udpCreateSocket.createUdpSocket("ipv4");
      assert.notEqual(socket2.id, 1);
    });

    // TODO: figure out how to mock handle.on("message", ...)
    test("udp.bind(): should bind to a valid ipv4 address and port=0", async () => {
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
        tag: "ipv6",
        val: {
          address: [0, 0, 0, 0, 0, 0, 0, 0],
          port: 0,
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
        const localAddress = {
          tag: "ipv6",
          val: {
            address: [0, 0, 0, 0, 0, 0, 0, 0],
            port: 1337,
          },
        };

        socket.startBind(network, localAddress);
        socket.finishBind();
        socket.stream();

        assert.strictEqual(socket.addressFamily(), "ipv6");

        const boundAddress = socket.localAddress();
        assert.deepStrictEqual(boundAddress.val.address, [0, 0, 0, 0, 0, 0, 0, 0]);
        assert.strictEqual(boundAddress.val.port, 1337);
      }),
    );
  });
});

suite("Instantiation", () => {
  test("WASIShim export (random)", async () => {
    const { random } = await import("@bytecodealliance/preview2-shim");
    const { WASIShim } = await import(
      "@bytecodealliance/preview2-shim/instantiation"
    );
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
    const { WASIShim } = await import(
      "@bytecodealliance/preview2-shim/instantiation"
    );
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
});

function testWithGCWrap(asyncTestFn) {
  return async () => {
    await asyncTestFn();
    // Force the JS GC to run finalizers
    gc();
    await new Promise((resolve) => setTimeout(resolve, 200));
  };
}
