import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WASI as NodeWASI } from "node:wasi";
import { describe, expect, test } from "vitest";
import { createWasi } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/core.js";
import denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi-host.js";
import nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi-host-node.js";
import type { WasiHostOptions } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/types.js";
import { describeDifferential } from "../helpers/assert.js";
import { failureOf } from "../helpers/wasi.js";

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

function options(overrides: Partial<WasiHostOptions> = {}): WasiHostOptions {
  return {
    version: "preview1",
    args: [],
    env: [],
    preopens: [],
    stdin: 0,
    stdout: 1,
    stderr: 2,
    ...overrides,
  };
}

/** A directory and a file inside it, for preopens that exist, are files, or are missing. */
function sandbox(): { dir: string; file: string; missing: string } {
  const dir = mkdtempSync(join(tmpdir(), "jco-wasi-"));
  const file = join(dir, "file");
  writeFileSync(file, "");
  return { dir, file, missing: join(dir, "missing") };
}

describe("deny-by-default wasi provider", () => {
  test("refuses initialisation with the adapter-required record", () => {
    expect(recordOf(() => denyHost.init(options()))).toEqual({
      name: "Error",
      message: "node:wasi requires an application-provided host adapter",
      code: "ERR_JCO_WASI_ADAPTER_REQUIRED",
    });
  });

  test("surfaces as a coded error from the constructor, after option validation", () => {
    const { WASI } = createWasi(denyHost);
    expect(failureOf(() => new WASI({ version: "preview1" }))).toMatchObject({
      name: "Error",
      code: "ERR_JCO_WASI_ADAPTER_REQUIRED",
    });
    expect(failureOf(() => new WASI({ version: "nope" }))?.code).toBe("ERR_INVALID_ARG_VALUE");
  });
});

describe("Node wasi provider", () => {
  test("initialises valid options without returning anything", () => {
    const { dir } = sandbox();
    expect(nodeHost.init(options())).toBeUndefined();
    expect(
      nodeHost.init(
        options({
          version: "unstable",
          args: ["a", "b"],
          env: [["A", "1"]],
          preopens: [["/sandbox", dir]],
        }),
      ),
    ).toBeUndefined();
  });

  test("serializes uvwasi_init failures as Node raises them", () => {
    const { file, missing } = sandbox();
    expect(recordOf(() => nodeHost.init(options({ preopens: [["/x", missing]] })))).toEqual({
      name: "Error",
      message: "UVWASI_ENOENT, uvwasi_init",
      code: "UVWASI_ENOENT",
      errno: { tag: "number", val: 44n },
      syscall: "uvwasi_init",
    });
    expect(recordOf(() => nodeHost.init(options({ preopens: [["/x", file]] })))).toMatchObject({
      code: "UVWASI_ENOTDIR",
      syscall: "uvwasi_init",
    });
    expect(recordOf(() => nodeHost.init(options({ stdin: 12345 })))).toMatchObject({
      code: "UVWASI_EBADF",
      errno: { tag: "number", val: 8n },
      syscall: "uvwasi_init",
    });
  });
});

describeDifferential("node:wasi over the Node provider against Node", () => {
  test("constructs and fails exactly as Node's constructor does", () => {
    const { dir, file, missing } = sandbox();
    const { WASI } = createWasi(nodeHost);
    for (const opts of [
      { version: "preview1" },
      { version: "preview1", preopens: { "/sandbox": dir }, args: ["x"], env: { A: "1" } },
      { version: "preview1", preopens: { "/sandbox": missing } },
      { version: "preview1", preopens: { "/sandbox": file } },
      { version: "preview1", stdin: 12345 },
      { version: "preview1", stdin: 12345, preopens: { "/sandbox": missing } },
      { version: "preview1", stderr: 12345, returnOnExit: 1 as never },
    ]) {
      expect(
        failureOf(() => new WASI(opts)),
        JSON.stringify(opts),
      ).toEqual(failureOf(() => new NodeWASI(opts)));
    }
  });
});
