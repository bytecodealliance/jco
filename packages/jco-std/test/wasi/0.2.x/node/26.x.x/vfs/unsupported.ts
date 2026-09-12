import { expect, test } from "vitest";
import { memory, vfs } from "../helpers/vfs.js";

test("native hooks, streams and watchers fail before inspecting arguments", () => {
  const fs = memory();
  const poison = new Proxy(
    {},
    {
      get() {
        throw new Error("argument inspected");
      },
    },
  );
  for (const operation of [
    () => fs.mount(poison),
    () => fs.unmount(poison),
    () => fs.createReadStream(poison),
    () => fs.createWriteStream(poison),
    () => fs.watch(poison),
    () => fs.watchFile(poison),
    () => fs.unwatchFile(poison),
    () => fs.promises.watch(poison),
    () => new vfs.MemoryProvider().watch(poison),
  ]) {
    expect(operation).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
  }
  expect(fs.mounted).toBe(false);
  expect(fs.mountPoint).toBeNull();
  expect(fs.shouldHandle("/file")).toBe(false);
});
