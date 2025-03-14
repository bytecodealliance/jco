import process from "node:process";

import { fileURLToPath } from "node:url";
import { ok, strictEqual, rejects } from "node:assert";

import { WritableStream } from "stream/web";
import { Readable } from "stream";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

suite("Node.js Preview3", () => {
  test("setStdout to Readable stream", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");
    const { stream } = await import("@bytecodealliance/preview3-shim/stream");

    const restore = process.stdout.write.bind(process.stdout);
    let output = "";

    process.stdout.write = (chunk, encoding, callback) => {
      output += chunk;
      if (callback) callback();
    };

    const [tx, rx] = stream();
    cli.stdout.setStdout(rx);

    const message = "Hello world!";

    await tx.write(message);
    await tx.close();

    await new Promise((resolve) => setTimeout(resolve, 200));

    process.stdout.write = restore;
    strictEqual(output, message);
  });

  test("getStdin returns a StreamReader", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");

    const input = "Hello, stdin!";
    const fakeStdin = Readable.from([input]);

    const fd = process.stdin;

    Object.defineProperty(process, "stdin", {
      value: fakeStdin,
      configurable: true,
    });

    const streamReader = cli.stdin.getStdin();
    const result = await streamReader.read();
    strictEqual(result, input);

    Object.defineProperty(process, "stdin", { value: fd });
  });

  test("Overriding previously set stdout", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");
    const { stream } = await import("@bytecodealliance/preview3-shim/stream");

    const restore = process.stdout.write.bind(process.stdout);
    let output = "";

    process.stdout.write = (chunk, encoding, callback) => {
      output += chunk;
      if (callback) callback();
    };

    const [tx1, rx1] = stream();
    cli.stdout.setStdout(rx1);

    await tx1.write("Hello ");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const [tx2, rx2] = stream();
    cli.stdout.setStdout(rx2);
    await tx2.write("world!");

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Write an additional message on the first stream after switching.
    await rejects(async () => {
      await tx1.write("The owls are not what they seem.");
    }, "Writing to the old stream should fail");

    await tx1.close();
    await tx2.close();

    await new Promise((resolve) => setTimeout(resolve, 100));
    process.stdout.write = restore;

    // Expected behavior:
    // - The "Hello " (written before switching) is output.
    // - The "World!" (from the new stream) is output.
    // - The "The owls..." (written to the old stream after switching) is NOT output.
    strictEqual(output, "Hello world!");
  });

  test("Simple Future", async () => {
    const { future } = await import("@bytecodealliance/preview3-shim/future");

    const [tx, rx] = future();

    const message = "Hello world!";
    await tx.write(message);

    // The reader will get the value on the first read.
    const value = await rx.read();
    strictEqual(value, "Hello world!");

    // Subsequent reads return null.
    const noValue = await rx.read();
    strictEqual(noValue, null);
  });

  test("Filesystem read", async () => {
    const toDispose = [];
    await (async () => {
      const { filesystem } = await import("@bytecodealliance/preview3-shim");
      const [[rootDescriptor]] = filesystem.preopens.getDirectories();

      // Open a child descriptor at the current file path.
      const childDescriptor = rootDescriptor.openAt(
        {},
        fileURLToPath(import.meta.url).slice(1),
        {},
        {},
      );

      const [streamReader, futureReader] = childDescriptor.readViaStream(0);

      const buf = await streamReader.read();
      const source = new TextDecoder().decode(buf);
      ok(source.includes("UNIQUE STRING"));

      await futureReader.read();
      toDispose.push(childDescriptor);
    })();

    // Force the Poll to GC so the next dispose doesn't trap
    gc();
    await new Promise((resolve) => setTimeout(resolve, 200));

    for (const item of toDispose) {
      item[symbolDispose]();
    }
  });
});
