import { expect, test } from "vitest";
import { vfs } from "../helpers/vfs.js";

test("creates isolated trees and accepts provider/options overloads", () => {
  const first = vfs.create({ emitExperimentalWarning: false });
  const second = new vfs.VirtualFileSystem();
  first.writeFileSync("/file", "first");
  expect(second.existsSync("/file")).toBe(false);
  expect(first.provider).toBeInstanceOf(vfs.MemoryProvider);
  expect(vfs.create(first.provider).readFileSync("/file", "utf8")).toBe("first");
  expect(Object.isFrozen(first.promises)).toBe(true);
  expect(first.promises).toBe(first.promises);
  expect(() => vfs.create({ emitExperimentalWarning: "yes" as unknown as boolean })).toThrow(
    /boolean/,
  );
});
