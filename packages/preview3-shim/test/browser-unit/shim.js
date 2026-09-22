import { createServer } from "node:http";

import { afterAll, assert, beforeAll, suite, test } from "vitest";

import * as cli from "@bytecodealliance/preview3-shim/cli";
import { monotonicClock, systemClock } from "@bytecodealliance/preview3-shim/clocks";
import * as filesystem from "@bytecodealliance/preview3-shim/filesystem";
import { client, types as httpTypes } from "@bytecodealliance/preview3-shim/http";
import { insecure, insecureSeed, random } from "@bytecodealliance/preview3-shim/random";
import * as sockets from "@bytecodealliance/preview3-shim/sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function byteStream(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return new ReadableStream({
    start(controller) {
      for (const byte of bytes) {
        controller.enqueue(byte);
      }
      controller.close();
    },
  });
}

async function readBytes(stream) {
  const bytes = [];
  for await (const byte of stream) {
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

suite("Preview 3 browser shim", () => {
  test("CLI delegates configuration and stream output to Preview 2", async () => {
    const writes = [];
    cli._setEnv({ TARGET: "browser" });
    cli._setArgs(["component", "arg"]);
    cli._setCwd("/work");
    cli._setStdout({ write: (bytes) => writes.push(...bytes) });

    assert.deepEqual(cli.environment.getEnvironment(), [["TARGET", "browser"]]);
    assert.deepEqual(cli.environment.getArguments(), ["component", "arg"]);
    assert.strictEqual(cli.environment.getInitialCwd(), "/work");
    assert.deepEqual(await cli.stdout.writeViaStream(byteStream("hello")), {
      tag: "ok",
      val: undefined,
    });
    assert.strictEqual(decoder.decode(Uint8Array.from(writes)), "hello");
  });

  test("clocks expose Preview 3 values and async waits", async () => {
    assert.strictEqual(typeof monotonicClock.now(), "bigint");
    assert.strictEqual(typeof monotonicClock.getResolution(), "bigint");
    assert.strictEqual(typeof systemClock.now().seconds, "bigint");
    assert.strictEqual(typeof systemClock.getResolution(), "bigint");
    await monotonicClock.waitFor(0n);
  });

  test("random delegates secure and insecure generation", () => {
    assert.strictEqual(random.getRandomBytes(17n).byteLength, 17);
    assert.strictEqual(insecure.getInsecureRandomBytes(9n).byteLength, 9);
    assert.lengthOf(insecureSeed.getInsecureSeed(), 2);
  });

  test("filesystem adapts Preview 2 descriptors and byte streams", async () => {
    filesystem._setFileData({ dir: {} });
    const [[root, path]] = filesystem.preopens.getDirectories();
    assert.strictEqual(path, "/");
    assert.deepEqual(await root.getType(), { tag: "directory" });

    const file = await root.openAt(
      {},
      "roundtrip.txt",
      { create: true },
      {
        read: true,
        write: true,
      },
    );
    assert.deepEqual(await file.writeViaStream(byteStream("preview three"), 0n), {
      tag: "ok",
      val: undefined,
    });
    const [contents, completed] = file.readViaStream(0n);
    assert.strictEqual(decoder.decode(await readBytes(contents)), "preview three");
    assert.deepEqual(await completed, { tag: "ok", val: undefined });
    assert.deepEqual((await file.stat()).type, { tag: "regular-file" });
  });

  suite("HTTP", () => {
    let server;
    let authority;

    beforeAll(async () => {
      server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/plain", "x-preview": "three" });
        response.end("browser fetch");
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      authority = `127.0.0.1:${server.address().port}`;
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    test("adapts Preview 3 requests to the Preview 2 fetch client", async () => {
      const [request, transmitted] = httpTypes.Request.new(
        new httpTypes.Fields(),
        undefined,
        Promise.resolve({ tag: "ok", val: undefined }),
        undefined,
      );
      request.setScheme({ tag: "HTTP" });
      request.setAuthority(authority);
      request.setPathWithQuery("/");

      const response = await client.send(request);
      assert.strictEqual(response.getStatusCode(), 200);
      assert.strictEqual(decoder.decode(response.getHeaders().get("x-preview")[0]), "three");
      const [contents, trailers] = httpTypes.Response.consumeBody(
        response,
        Promise.resolve({ tag: "ok", val: undefined }),
      );
      assert.strictEqual(decoder.decode(await readBytes(contents)), "browser fetch");
      assert.strictEqual((await trailers).tag, "ok");
      assert.deepEqual(await transmitted, { tag: "ok", val: undefined });
    });
  });

  test("sockets default to stable not-supported errors", async () => {
    let tcpError;
    try {
      sockets.types.TcpSocket.create("ipv4");
    } catch (error) {
      tcpError = error;
    }
    assert.strictEqual(tcpError?.payload?.tag, "not-supported");

    let lookupError;
    try {
      await sockets.ipNameLookup.resolveAddresses("example.com");
    } catch (error) {
      lookupError = error;
    }
    assert.deepEqual(lookupError?.payload, { tag: "other", val: "not-supported" });
  });

  test("TCP wraps the Preview 2 in-memory socket provider", async () => {
    const provider = new sockets.InMemoryTcpSockets();
    const previous = sockets._setTcpProvider(provider);
    try {
      const address = {
        tag: "ipv4",
        val: { address: [127, 0, 0, 1], port: 8080 },
      };
      const listener = sockets.types.TcpSocket.create("ipv4");
      listener.bind(address);
      const accepts = listener.listen().getReader();
      const client = provider.connect(address);
      client.write(encoder.encode("in-memory TCP"));
      const { value: connection } = await accepts.read();
      const [contents] = connection.receive();
      assert.strictEqual(decoder.decode(await readBytes(contents)), "in-memory TCP");
    } finally {
      sockets._setTcpProvider(previous);
    }
  });

  test("UDP wraps the Preview 2 in-memory socket provider", async () => {
    const provider = new sockets.InMemoryUdpSockets();
    const previous = sockets._setUdpProvider(provider);
    try {
      const serverAddress = {
        tag: "ipv4",
        val: { address: [127, 0, 0, 1], port: 8081 },
      };
      const clientAddress = {
        tag: "ipv4",
        val: { address: [127, 0, 0, 1], port: 9091 },
      };
      const socket = sockets.types.UdpSocket.create("ipv4");
      socket.bind(serverAddress);
      const client = provider.createClient(clientAddress);
      client.send(encoder.encode("in-memory UDP"), serverAddress);
      const [data, remoteAddress] = await socket.receive();
      assert.strictEqual(decoder.decode(data), "in-memory UDP");
      assert.deepEqual(remoteAddress, clientAddress);
    } finally {
      sockets._setUdpProvider(previous);
    }
  });
});
