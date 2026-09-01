import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { fs, promises, withFsFixture } from "../helpers/fs.js";

describe("node:fs callback and promise facades", () => {
  test("queues callbacks after the current stack", async () => {
    await withFsFixture(async (root) => {
      const path = join(root, "callback.txt");
      fs.writeFileSync(path, "callback");
      const order = ["before"];
      const completed = new Promise<void>((resolve, reject) => {
        fs.readFile(path, "utf8", (error, value) => {
          if (error) {
            return reject(error);
          }
          order.push(String(value));
          resolve();
        });
      });
      order.push("after");
      await completed;
      expect(order).toEqual(["before", "after", "callback"]);
    });
  });

  test("promise operations share state with synchronous operations", async () => {
    await withFsFixture(async (root) => {
      const path = join(root, "promise.txt");
      await promises.writeFile(path, "promise");
      expect(fs.readFileSync(path, "utf8")).toBe("promise");
      expect(await promises.readFile(path, "utf8")).toBe("promise");
      expect((await promises.stat(path))?.isFile()).toBe(true);
    });
  });

  test("invokes an error callback once", async () => {
    await withFsFixture(async (root) => {
      const callback = vi.fn();
      fs.readFile(join(root, "missing"), callback);
      await new Promise((resolve) => setTimeout(resolve));
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ code: "ENOENT" });
    });
  });

  test("does not reinterpret exceptions thrown by callbacks as operation failures", async () => {
    await withFsFixture((root) => {
      const path = join(root, "callback-throw.txt");
      fs.writeFileSync(path, "value");
      const failure = new Error("callback failed");
      const callback = vi.fn(() => {
        throw failure;
      });
      const microtask = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => task());

      try {
        expect(() => fs.readFile(path, callback)).toThrow(failure);
        expect(callback).toHaveBeenCalledOnce();
      } finally {
        microtask.mockRestore();
      }
    });
  });
});
