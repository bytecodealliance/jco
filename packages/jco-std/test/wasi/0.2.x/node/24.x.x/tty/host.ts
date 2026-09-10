import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nodeTty from "node:tty";
import { describe, expect, test } from "vitest";
import { createTty } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/core.js";
import denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty-host.js";
import nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty-host-node.js";
import { serializeTtyError } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/host-utils.js";
import { errorOf } from "../helpers/tty.js";

function recordOf(fn: () => unknown): Record<string, unknown> {
  try {
    fn();
  } catch (error) {
    if (typeof error === "object" && error !== null && !(error instanceof Error)) {
      return error as Record<string, unknown>;
    }
    throw new Error(`Expected a serialized record, got ${String(error)}`);
  }
  throw new Error("Expected operation to fail");
}

/** A descriptor that is certainly not a terminal. */
function fileDescriptor(): { fd: number; path: string } {
  const path = join(tmpdir(), `jco-tty-${process.pid}-${Math.random().toString(16).slice(2)}`);
  writeFileSync(path, "");
  return { fd: openSync(path, "r+"), path };
}

describe("deny-by-default terminal provider", () => {
  test("refuses every operation with the adapter-required record", () => {
    const operations: Array<[string, () => unknown]> = [
      ["isTty", () => denyHost.isTty(1)],
      ["open", () => denyHost.open(1, "write")],
      ["close", () => denyHost.close(1, "write")],
      ["windowSize", () => denyHost.windowSize(1)],
      ["setRawMode", () => denyHost.setRawMode(0, true)],
      ["read", () => denyHost.read(0, 1)],
      ["write", () => denyHost.write(1, new Uint8Array(1))],
      ["environment", () => denyHost.environment()],
    ];
    for (const [name, operation] of operations) {
      expect(recordOf(operation), name).toEqual({
        name: "Error",
        message: "node:tty requires an application-provided host adapter",
        code: "ERR_JCO_TTY_ADAPTER_REQUIRED",
      });
    }
  });

  test("surfaces as coded errors through the module", () => {
    const tty = createTty(denyHost);
    for (const operation of [
      () => tty.isatty(0),
      () => new tty.ReadStream(0),
      () => new tty.WriteStream(1),
      () => tty.WriteStream.prototype.getColorDepth.call(undefined),
      () => tty.WriteStream.prototype.hasColors.call(undefined),
    ]) {
      const error = errorOf(operation);
      expect(error.code).toBe("ERR_JCO_TTY_ADAPTER_REQUIRED");
      expect(error).toBeInstanceOf(Error);
    }
  });
});

describe("Node terminal provider", () => {
  test("answers isatty for the embedding process's descriptors", () => {
    const { fd } = fileDescriptor();
    try {
      for (const candidate of [0, 1, 2, fd, 4096]) {
        expect(nodeHost.isTty(candidate)).toBe(nodeTty.isatty(candidate));
      }
    } finally {
      closeSync(fd);
    }
  });

  test("opening a descriptor that is not a terminal reproduces Node's own error", () => {
    const { fd } = fileDescriptor();
    try {
      const expected = errorOf(() => new nodeTty.WriteStream(fd));
      expect(recordOf(() => nodeHost.open(fd, "write"))).toEqual(serializeTtyError(expected));
      expect(recordOf(() => nodeHost.open(fd, "read"))).toEqual(serializeTtyError(expected));

      const tty = createTty(nodeHost);
      const actual = errorOf(() => new tty.WriteStream(fd));
      expect(actual.name).toBe(expected.name);
      expect(actual.code).toBe("ERR_TTY_INIT_FAILED");
      expect(actual.message).toBe(expected.message);
      expect(actual.errno).toBe(expected.errno);
      expect(actual.syscall).toBe(expected.syscall);
      expect(actual.info).toEqual(expected.info);
    } finally {
      closeSync(fd);
    }
  });

  test("operations on descriptors that were never opened fail as bad descriptors", () => {
    expect(recordOf(() => nodeHost.setRawMode(4096, true))).toMatchObject({
      code: "EBADF",
      syscall: "setRawMode",
    });
    expect(recordOf(() => nodeHost.windowSize(4096))).toMatchObject({
      code: "EBADF",
      syscall: "getWindowSize",
    });
    expect(nodeHost.close(4096, "write")).toBeUndefined();
  });

  test("reads and writes the descriptor's bytes", () => {
    const { fd, path } = fileDescriptor();
    const reader = openSync(path, "r");
    try {
      nodeHost.write(fd, new TextEncoder().encode("héllo"));
      expect(readFileSync(path, "utf8")).toBe("héllo");
      expect(new TextDecoder().decode(nodeHost.read(reader, 3))).toBe("hé");
      expect(new TextDecoder().decode(nodeHost.read(reader, 64 * 1024))).toBe("llo");
      // End of input is an empty read.
      expect(nodeHost.read(reader, 16)).toEqual(new Uint8Array(0));
      expect(recordOf(() => nodeHost.read(4096, 1))).toMatchObject({ code: "EBADF" });
      expect(recordOf(() => nodeHost.write(4096, new Uint8Array(1)))).toMatchObject({
        code: "EBADF",
      });
    } finally {
      closeSync(fd);
      closeSync(reader);
    }
  });

  test("exposes the embedding process's environment", () => {
    expect(nodeHost.environment()).toEqual(
      Object.entries(process.env).filter((entry) => typeof entry[1] === "string"),
    );
  });
});
