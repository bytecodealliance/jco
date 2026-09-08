import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, test } from "vitest";

import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs-host-node.js";
import { createFsCore } from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs/core.js";
import type { FsHost } from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs/types.js";
import type { HostImports } from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/wit-types.js";
import { withFsFixture } from "../helpers/fs.js";

function unwrappedHost(componentError: boolean): HostImports<FsHost> {
  return Object.fromEntries(
    Object.entries(nodeHost)
      .filter(([, value]) => typeof value === "function")
      .map(([name, operation]) => [
        name,
        (...args: unknown[]) => {
          const result = (operation as (...args: unknown[]) => { tag: string; val: unknown })(
            ...args,
          );
          if (result.tag === "err") {
            throw componentError
              ? Object.assign(new Error("WIT error"), { payload: result.val })
              : result.val;
          }
          return result.val;
        },
      ]),
  ) as HostImports<FsHost>;
}

describe.each([
  ["tagged", nodeHost],
  ["unwrapped with thrown records", unwrappedHost(false)],
  ["unwrapped with ComponentError payloads", unwrappedHost(true)],
] as const)("node:fs host results: %s", (_name, host) => {
  const core = createFsCore(host);

  test("accepts void, boolean, byte-list, numeric, and record successes", async () => {
    await withFsFixture((root) => {
      const directory = join(root, "directory");
      const file = join(directory, "file.txt");
      expect(core.mkdirSync(directory)).toBeUndefined();
      expect(core.existsSync(file)).toBe(false);
      core.writeFileSync(file, "hello");
      expect(core.readFileSync(file, "utf8")).toBe("hello");
      expect(core.statSync(file)?.isFile()).toBe(true);
      const descriptor = core.openSync(file, "r");
      try {
        expect(core.readSync(descriptor, new Uint8Array(1), 0, 1, 5)).toBe(0);
      } finally {
        core.closeSync(descriptor);
      }
      expect(core.readdirSync(directory)).toEqual(["file.txt"]);
      expect(core.statSync(join(root, "absent"), { throwIfNoEntry: false })).toBeUndefined();
    });
  });

  test("reconstructs Node error fields from the WIT error record", async () => {
    await withFsFixture((root) => {
      const missing = join(root, "missing");
      expect(() => core.readFileSync(missing)).toThrow(
        expect.objectContaining({
          name: "Error",
          code: "ENOENT",
          errno: expect.any(Number),
          syscall: "open",
          path: missing,
        }),
      );
    });
  });
});

test("node:fs leaves non-WIT exceptions and traps unchanged", () => {
  for (const error of [
    new TypeError("provider bug"),
    new WebAssembly.RuntimeError("unreachable"),
  ]) {
    const core = createFsCore({
      ...nodeHost,
      mkdir: () => {
        throw error;
      },
    });
    expect(() => core.mkdirSync("unused")).toThrow(error);
  }
});

test("node:fs reads byte arrays created in another realm", () => {
  const data = runInNewContext("new Uint8Array([0, 104, 105, 0]).subarray(1, 3)") as Uint8Array;
  const core = createFsCore({ ...nodeHost, readFile: () => data });
  expect(core.readFileSync("unused", "utf8")).toBe("hi");
  const copy = core.readFileSync("unused") as Uint8Array;
  data[0] = 0;
  expect(Array.from(copy)).toEqual([104, 105]);
});
