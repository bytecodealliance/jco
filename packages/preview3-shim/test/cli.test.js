import { describe, test, expect } from "vitest";

import process from "node:process";
import { Readable } from "node:stream";

describe("Node.js Preview3 wasi-cli", () => {
  test("writeViaStream writes to stdout", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");
    const { stream } = await import("@bytecodealliance/preview3-shim/stream");

    // Stub out stdout.write
    const restore = process.stdout.write.bind(process.stdout);
    let output = "";

    const finished = new Promise((resolve) => {
      process.stdout.write = (chunk, _enc, cb) => {
        output += chunk;
        cb?.();
        if (output === message) {
          resolve();
        }
      };
    });

    const { tx, rx } = stream();
    const resultPromise = cli.stdout.writeViaStream(rx);

    const message = "Hello world!";
    await tx.write(message);
    await tx.close();

    await finished;
    const result = await resultPromise;

    process.stdout.write = restore;
    expect(output).toBe(message);
    expect(result.tag).toBe("ok");
  });

  test("readViaStream returns [stream, future] tuple", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");

    const input = "Hello, stdin!";
    const fakeStdin = Readable.from([input]);
    const originalStdin = process.stdin;

    Object.defineProperty(process, "stdin", {
      value: fakeStdin,
      configurable: true,
    });

    const [streamReader] = cli.stdin.readViaStream();
    const result = await streamReader.read();
    expect(result).toBe(input);

    // restore stdin
    Object.defineProperty(process, "stdin", { value: originalStdin });
  });

  test("writeViaStream writes to stderr", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");
    const { stream } = await import("@bytecodealliance/preview3-shim/stream");

    const restore = process.stderr.write.bind(process.stderr);
    let output = "";

    const finished = new Promise((resolve) => {
      process.stderr.write = (chunk, _enc, cb) => {
        output += chunk;
        cb?.();
        if (output === message) {
          resolve();
        }
      };
    });

    const { tx, rx } = stream();
    const resultPromise = cli.stderr.writeViaStream(rx);

    const message = "error output";
    await tx.write(message);
    await tx.close();

    await finished;
    const result = await resultPromise;

    process.stderr.write = restore;
    expect(output).toBe(message);
    expect(result.tag).toBe("ok");
  });

  test("Overriding previously set stdout", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");
    const { stream } = await import("@bytecodealliance/preview3-shim/stream");

    const restore = process.stdout.write.bind(process.stdout);
    let output = "";

    const finished = new Promise((resolve) => {
      process.stdout.write = (chunk, _enc, cb) => {
        output += chunk;
        cb?.();
        if (output === message) {
          resolve();
        }
      };
    });

    const message = "Hello world!";

    // first stream
    const { tx: tx1, rx: rx1 } = stream();
    cli.stdout.writeViaStream(rx1);
    await tx1.write("Hello ");
    await tx1.close();
    await new Promise((r) => setTimeout(r, 50));

    // override stdout
    const { tx: tx2, rx: rx2 } = stream();
    cli.stdout.writeViaStream(rx2);
    await tx2.write("world!");

    // writing to old stream should now reject
    await expect(tx1.write("Oops")).rejects.toThrow();

    await tx2.close();
    await finished;

    process.stdout.write = restore;
    expect(output).toBe("Hello world!");
  });
});
