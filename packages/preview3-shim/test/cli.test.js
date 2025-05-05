import { describe, test, expect } from "vitest";

import process from "node:process";
import { Readable } from "stream";

describe("Node.js Preview3 wasi-cli", () => {
  test("setStdout to Readable stream", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");
    const { stream } = await import("@bytecodealliance/preview3-shim/stream");

    // Stub out stdout.write
    const restore = process.stdout.write.bind(process.stdout);
    let output = "";

    const finished = new Promise((resolve) => {
      process.stdout.write = (chunk, _enc, cb) => {
        output += chunk;
        cb?.();
        if (output === message) resolve();
      };
    });

    const [tx, rx] = stream();
    cli.stdout.setStdout(rx);

    const message = "Hello world!";
    await tx.write(message);
    await tx.close();

    await finished;

    process.stdout.write = restore;
    expect(output).toBe(message);
  });

  test("getStdin returns a StreamReader", async () => {
    const { cli } = await import("@bytecodealliance/preview3-shim");

    const input = "Hello, stdin!";
    const fakeStdin = Readable.from([input]);
    const originalStdin = process.stdin;

    Object.defineProperty(process, "stdin", {
      value: fakeStdin,
      configurable: true,
    });

    const streamReader = cli.stdin.getStdin();
    const result = await streamReader.read();
    expect(result).toBe(input);

    // restore stdin
    Object.defineProperty(process, "stdin", { value: originalStdin });
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
        if (output === message) resolve();
      };
    });

    const message = "Hello world!";

    // first stream
    const [tx1, rx1] = stream();
    cli.stdout.setStdout(rx1);
    await tx1.write("Hello ");
    await tx1.close();
    await new Promise((r) => setTimeout(r, 50));

    // override stdout
    const [tx2, rx2] = stream();
    cli.stdout.setStdout(rx2);
    await tx2.write("world!");

    // writing to old stream should now reject
    await expect(tx1.write("Oops")).rejects.toThrow();

    await tx2.close();
    await finished;

    process.stdout.write = restore;
    expect(output).toBe("Hello world!");
  });
});
