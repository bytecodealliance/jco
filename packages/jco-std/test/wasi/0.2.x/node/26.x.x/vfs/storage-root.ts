import { expect, test } from "vitest";
import {
  resolveStorageRoot,
  validateStorageRoot,
} from "../../../../../../src/wasi/0.2.x/node/26.x.x/vfs/wasi-paths.js";
import type { Descriptor } from "../../../../../../src/wasi/0.2.x/node/26.x.x/vfs/wasi-types.js";

// Selection must not consult the borrowed descriptor; every property read fails.
const descriptor = new Proxy(
  {},
  {
    get() {
      throw new Error("descriptor used during selection");
    },
  },
) as Descriptor;

test("default storage picks the most specific mount and returns a relative directory", () => {
  const selected = resolveStorageRoot("/data/projects/project", [
    [descriptor, "/"],
    [descriptor, "/data"],
    [descriptor, "/data/projects"],
  ]);
  expect(Object.is(selected.descriptor, descriptor)).toBe(true);
  expect(selected.directory).toBe("project");
  expect(resolveStorageRoot("/data", [[descriptor, "/data"]]).directory).toBe(".");
  expect(
    resolveStorageRoot("/data/projects/project", [
      [descriptor, "/data/./././././"],
      [descriptor, "/data/projects"],
    ]).directory,
  ).toBe("project");
  expect(() => resolveStorageRoot("/database", [[descriptor, "/data"]])).toThrow(
    expect.objectContaining({ code: "EACCES" }),
  );
  expect(() => resolveStorageRoot("/data", [])).toThrow(
    expect.objectContaining({ code: "EACCES" }),
  );
});

test("custom storage directories cannot lexically escape the selected preopen", () => {
  for (const directory of ["../escape", "/absolute", "nested/../../escape"]) {
    expect(() => validateStorageRoot({ descriptor, directory })).toThrow(
      expect.objectContaining({ code: "EACCES" }),
    );
  }
  expect(validateStorageRoot({ descriptor, directory: "nested/../storage" }).directory).toBe(
    "storage",
  );
});
