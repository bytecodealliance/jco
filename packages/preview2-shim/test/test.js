import { env } from "node:process";
import {
  throws
} from "node:assert";
import { fileURLToPath } from "node:url";

import { suite, test, assert, vi, beforeEach, afterEach } from "vitest";

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
      if (!env.CI) { assert.ok(nextNow - curNow < 15e6); }
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
      if (!env.CI) { assert.ok(nextNow - curNow < 15e6); }
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
      { retry: env.CI ?  3 : 0 },
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

suite("HTTPServer", () => {
    test(
        "HTTPServer: can retrieve randomized server address",
        testWithGCWrap(async () => {
            const { HTTPServer } = await import("@bytecodealliance/preview2-shim/http");
            const server = new HTTPServer({
                handle() {
                    throw new Error("never called");
                }
            });
            server.listen(0);
            const address = server.address();
            assert(Number.isSafeInteger(address?.port) && address?.port != 0, "a random port was assigned and retrieved");
        }),
    );
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


suite("Sandboxing", () => {
  let originalEnv;
  let originalArgs;

  beforeEach(async () => {
    const { cli, filesystem } = await import("@bytecodealliance/preview2-shim");
    // Save original state
    originalEnv = cli.environment.getEnvironment();
    originalArgs = cli.environment.getArguments();
  });

  afterEach(async () => {
    const { cli, filesystem } = await import("@bytecodealliance/preview2-shim");
    // Restore default state
    filesystem._setPreopens({ '/': '/' });
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

    filesystem._setPreopens({
      '/custom': '/tmp'
    });

    const preopens = filesystem.preopens.getDirectories();
    assert.strictEqual(preopens.length, 1, "Should have exactly one preopen");
    assert.strictEqual(preopens[0][1], '/custom', "Virtual path should be /custom");
  });

  test("_getPreopens returns current preopens", async () => {
    const { filesystem } = await import("@bytecodealliance/preview2-shim");

    const preopens = filesystem._getPreopens();
    assert.ok(Array.isArray(preopens), "Should return an array");
    // The returned array should be a copy
    preopens.push(['fake', '/fake']);
    const preopensAfter = filesystem._getPreopens();
    assert.notStrictEqual(preopens.length, preopensAfter.length, "Should return a copy");
  });

  test("WASIShim with empty preopens provides no filesystem access", async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

    const sandboxedShim = new WASIShim({
      sandbox: {
        preopens: {}
      }
    });

    const importObj = sandboxedShim.getImportObject();
    const dirs = importObj['wasi:filesystem/preopens'].getDirectories();
    assert.strictEqual(dirs.length, 0, "Should have no preopens");
  });

  test("WASIShim with custom env", async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

    const customShim = new WASIShim({
      sandbox: {
        env: { 'CUSTOM_VAR': 'custom_value', 'ANOTHER': 'value2' }
      }
    });

    const importObj = customShim.getImportObject();
    const env = importObj['wasi:cli/environment'].getEnvironment();
    assert.deepStrictEqual(env, [['CUSTOM_VAR', 'custom_value'], ['ANOTHER', 'value2']]);
  });

  test("WASIShim with custom args", async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

    const customShim = new WASIShim({
      sandbox: {
        args: ['program', '--flag', 'value']
      }
    });

    const importObj = customShim.getImportObject();
    const args = importObj['wasi:cli/environment'].getArguments();
    assert.deepStrictEqual(args, ['program', '--flag', 'value']);
  });

  test("WASIShim with enableNetwork=false denies network", async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

    const noNetworkShim = new WASIShim({
      sandbox: {
        enableNetwork: false
      }
    });

    const importObj = noNetworkShim.getImportObject();

    // TCP socket can be created, but operations are denied
    const tcpSocket = importObj['wasi:sockets/tcp-create-socket'].createTcpSocket('ipv4');
    const network = importObj['wasi:sockets/instance-network'].instanceNetwork();

    // Bind should throw access-denied
    assert.throws(() => {
      tcpSocket.startBind(network, { tag: 'ipv4', val: { address: [127, 0, 0, 1], port: 0 } });
    }, /access-denied/);

    // UDP socket can be created, but operations are denied
    const udpSocket = importObj['wasi:sockets/udp-create-socket'].createUdpSocket('ipv4');

    // Bind should throw access-denied
    assert.throws(() => {
      udpSocket.startBind(network, { tag: 'ipv4', val: { address: [127, 0, 0, 1], port: 0 } });
    }, /access-denied/);
  });

  test("WASIShim with enableNetwork=true (default) allows network", async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
    const { sockets } = await import("@bytecodealliance/preview2-shim");

    const defaultShim = new WASIShim();

    const importObj = defaultShim.getImportObject();

    // Should have the real implementations
    assert.strictEqual(
      importObj['wasi:sockets/tcp-create-socket'].createTcpSocket,
      sockets.tcpCreateSocket.createTcpSocket
    );
    assert.strictEqual(
      importObj['wasi:sockets/udp-create-socket'].createUdpSocket,
      sockets.udpCreateSocket.createUdpSocket
    );
  });

  test("Fully sandboxed WASIShim", async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

    const sandboxed = new WASIShim({
      sandbox: {
        preopens: {},
        env: {},
        args: ['sandboxed-program'],
        enableNetwork: false
      }
    });

    const importObj = sandboxed.getImportObject();

    // Verify all restrictions
    assert.strictEqual(
      importObj['wasi:filesystem/preopens'].getDirectories().length,
      0,
      "No filesystem access"
    );
    assert.deepStrictEqual(
      importObj['wasi:cli/environment'].getEnvironment(),
      [],
      "No environment variables"
    );
    assert.deepStrictEqual(
      importObj['wasi:cli/environment'].getArguments(),
      ['sandboxed-program'],
      "Custom arguments"
    );

    // Network operations should be denied
    const tcpSocket = importObj['wasi:sockets/tcp-create-socket'].createTcpSocket('ipv4');
    const network = importObj['wasi:sockets/instance-network'].instanceNetwork();
    assert.throws(() => {
      tcpSocket.startBind(network, { tag: 'ipv4', val: { address: [127, 0, 0, 1], port: 0 } });
    }, /access-denied/, "No network access");
  });

  test("Multiple WASIShim instances have isolated preopens", async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

    // Create two shims with different preopens
    const shim1 = new WASIShim({
      sandbox: {
        preopens: { '/a': '/tmp/a' }
      }
    });
    const shim2 = new WASIShim({
      sandbox: {
        preopens: { '/b': '/tmp/b' }
      }
    });

    const obj1 = shim1.getImportObject();
    const obj2 = shim2.getImportObject();

    const dirs1 = obj1['wasi:filesystem/preopens'].getDirectories();
    const dirs2 = obj2['wasi:filesystem/preopens'].getDirectories();

    assert.strictEqual(dirs1.length, 1, "shim1 should have 1 preopen");
    assert.strictEqual(dirs2.length, 1, "shim2 should have 1 preopen");
    assert.strictEqual(dirs1[0][1], '/a', "shim1 should have /a");
    assert.strictEqual(dirs2[0][1], '/b', "shim2 should have /b");

    // They should not affect each other
    assert.notStrictEqual(dirs1, dirs2, "Should be different arrays");
  });

  test("Multiple WASIShim instances have isolated env and args", async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

    const shim1 = new WASIShim({
      sandbox: {
        env: { 'VAR': 'value1' },
        args: ['prog1']
      }
    });
    const shim2 = new WASIShim({
      sandbox: {
        env: { 'VAR': 'value2' },
        args: ['prog2']
      }
    });

    const obj1 = shim1.getImportObject();
    const obj2 = shim2.getImportObject();

    const env1 = obj1['wasi:cli/environment'].getEnvironment();
    const env2 = obj2['wasi:cli/environment'].getEnvironment();
    const args1 = obj1['wasi:cli/environment'].getArguments();
    const args2 = obj2['wasi:cli/environment'].getArguments();

    assert.deepStrictEqual(env1, [['VAR', 'value1']], "shim1 env");
    assert.deepStrictEqual(env2, [['VAR', 'value2']], "shim2 env");
    assert.deepStrictEqual(args1, ['prog1'], "shim1 args");
    assert.deepStrictEqual(args2, ['prog2'], "shim2 args");
  });

  test("WASIShim isolated preopens can read files", testWithGCWrap(async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
    const { dirname } = await import("node:path");

    const testFilePath = fileURLToPath(import.meta.url);
    const testDir = dirname(testFilePath);
    const testFileName = "test.js";

    // Create a shim with preopens pointing to the test directory
    const shim = new WASIShim({
      sandbox: {
        preopens: { '/test': testDir }
      }
    });

    const importObj = shim.getImportObject();
    const preopens = importObj['wasi:filesystem/preopens'];
    const dirs = preopens.getDirectories();

    assert.strictEqual(dirs.length, 1, "Should have one preopen");
    assert.strictEqual(dirs[0][1], '/test', "Virtual path should be /test");

    const [rootDescriptor] = dirs[0];

    // Open and read the test file
    const childDescriptor = rootDescriptor.openAt(
      {},
      testFileName,
      {},
      { read: true }
    );

    const stream = childDescriptor.readViaStream(0);
    const poll = stream.subscribe();
    poll.block();
    let buf = stream.read(10000n);
    while (buf.byteLength === 0) buf = stream.read(10000n);
    const source = new TextDecoder().decode(buf);

    // Verify we read the actual test file content
    assert.ok(source.includes("UNIQUE STRING"), "Should read file content");

    // Dispose in correct order: poll first, then stream, then descriptor
    poll[symbolDispose]();
    stream[symbolDispose]();
    childDescriptor[symbolDispose]();
  }));

  test("WASIShim isolated preopens don't access paths outside preopen", testWithGCWrap(async () => {
    const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
    const { dirname } = await import("node:path");

    const testFilePath = fileURLToPath(import.meta.url);
    const testDir = dirname(testFilePath);

    // Create a shim with limited preopens
    const shim = new WASIShim({
      sandbox: {
        preopens: { '/test': testDir }
      }
    });

    const importObj = shim.getImportObject();
    const [rootDescriptor] = importObj['wasi:filesystem/preopens'].getDirectories()[0];

    // Attempting to traverse outside the preopen should fail
    assert.throws(() => {
      rootDescriptor.openAt({}, '../package.json', {}, { read: true });
    }, /not-permitted/, "Should not allow traversing outside preopen");
  }));
});
suite("Browser shim guards", () => {
  test("pollList throws on empty list", async () => {
    const { poll } = await import("../lib/browser/io.js");
    assert.throws(() => poll.poll([]), /empty/);
  });

  test("pollList throws on list exceeding u32 range", async () => {
    const { poll } = await import("../lib/browser/io.js");
    const fakeList = { length: 0x100000000 };
    assert.throws(() => poll.poll(fakeList), /u32/);
  });

  test("RequestOptions rejects negative connect timeout", async () => {
    const { types } = await import("../lib/browser/http.js");
    const opts = new types.RequestOptions();
    assert.throws(() => opts.setConnectTimeout(-1n), /negative/);
  });

  test("RequestOptions rejects negative first-byte timeout", async () => {
    const { types } = await import("../lib/browser/http.js");
    const opts = new types.RequestOptions();
    assert.throws(() => opts.setFirstByteTimeout(-1n), /negative/);
  });

  test("RequestOptions rejects negative between-bytes timeout", async () => {
    const { types } = await import("../lib/browser/http.js");
    const opts = new types.RequestOptions();
    assert.throws(() => opts.setBetweenBytesTimeout(-1n), /negative/);
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
