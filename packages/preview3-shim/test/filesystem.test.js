import { describe, test, expect } from "vitest";
import { fileURLToPath } from "node:url";

describe("Node.js Preview3 wasi-filesystem", () => {
  test("Filesystem read", async () => {
    const { filesystem } = await import("@bytecodealliance/preview3-shim");
    const [[rootDescriptor]] = filesystem.preopens.getDirectories();

    // open child descriptor at this file
    const child = rootDescriptor.openAt(
      {},
      fileURLToPath(import.meta.url).slice(1),
      {},
      {},
    );

    const [streamReader, futureReader] = child.readViaStream(0);
    const buf = await streamReader.readAll();
    const text = new TextDecoder().decode(buf);
    expect(text).toContain("UNIQUE STRING");

    // wait for the operation to finish
    await futureReader.read();

    // dispose
    child[Symbol.dispose]?.();
  });
});
