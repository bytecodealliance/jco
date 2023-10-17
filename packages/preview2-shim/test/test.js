import { equal, ok, strictEqual,  } from 'node:assert';
import { fileURLToPath } from 'node:url';

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

  test('Sockets', async () => {
    const { sockets } = await import('@bytecodealliance/preview2-shim');
    const net = sockets.instanceNetwork.instanceNetwork();

    equal(net.id, 0);
  });

});
