import nodeFs from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, vi } from "vitest";

const hostCalls = vi.hoisted(() => [] as string[]);
vi.mock("jco:node/fs@0.1.0", async () => {
  const host = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/fs-host-node.js");
  return Object.fromEntries(
    Object.entries(host).map(([name, value]) => [
      name,
      typeof value === "function"
        ? (...args: unknown[]) => {
            hostCalls.push(name);
            return Reflect.apply(value, undefined, args);
          }
        : value,
    ]),
  );
});

import fs, * as named from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs.js";
import promises, * as namedPromises from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs-promises.js";
import { withFsFixture } from "../helpers/fs.js";

const callsDuringImport = [...hostCalls];
test("constructing optional facades performs no host operations", () => {
  expect(callsDuringImport).toEqual([]);
});

test("static exports preserve the full facade and shared identities", () => {
  expect(Object.keys(fs).sort()).toEqual(Object.keys(nodeFs).sort());
  for (const key of Object.keys(fs)) {
    expect(Reflect.get(named, key), key).toBe(Reflect.get(fs, key));
  }
  for (const key of Object.keys(promises)) {
    expect(Reflect.get(namedPromises, key), key).toBe(Reflect.get(promises, key));
  }
  expect(fs.promises).toBe(promises);
  expect(fs.constants).toBe(promises.constants);
  expect(fs.ReadStream).toBe(fs.FileReadStream);
  expect(fs.WriteStream).toBe(fs.FileWriteStream);
  expect(fs.realpath.native).not.toBe(fs.realpath);
  expect(fs.realpathSync.native).not.toBe(fs.realpathSync);
});

test("detached functions preserve runtime paths, encodings, stats and overloads", async () => {
  await withFsFixture((root) => {
    const path = join(root, "data.txt");
    const { readFileSync, writeFileSync, statSync, openSync, readSync, writeSync, closeSync } =
      named;
    const bytes = Buffer.from([0x68, 0xc3, 0xa9, 0xff]);
    writeFileSync(path, bytes);
    expect(readFileSync(Buffer.from(path))).toEqual(bytes);
    expect(readFileSync(pathToFileURL(path), "utf8")).toBe("hé�");
    expect(statSync(path)).toBeInstanceOf(fs.Stats);
    expect(statSync(path)?.size).toBe(4);
    expect(statSync(path, { bigint: true })?.size).toBe(4n);
    const fd = openSync(path, "r+");
    try {
      const result = Buffer.alloc(3);
      expect(readSync(fd, result, { position: 0 })).toBe(3);
      expect(result.toString()).toBe("hé");
      expect(writeSync(fd, "ok", 0, "utf8")).toBe(2);
      expect(writeSync(fd, Buffer.from("!"), { position: 2 })).toBe(1);
      expect(fs.fstatSync(fd).size).toBe(4);
    } finally {
      closeSync(fd);
    }
    expect(readFileSync(path, "utf8")).toBe("ok!�");
    expect(fs.realpathSync.native(path)).toBe(fs.realpathSync(path));
    expect(() => readFileSync(new URL("https://example.com/"))).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
  });
});

test("callbacks and promises share descriptors and retain error timing", async () => {
  await withFsFixture(async (root) => {
    const path = join(root, "data.txt");
    const handle = await promises.open(path, "w+");
    try {
      fs.writeFileSync(handle.fd, "shared");
      expect((await handle.stat()).size).toBe(6);
      const target = Buffer.alloc(6);
      expect((await handle.read(target, { position: 0 })).bytesRead).toBe(6);
      expect(target.toString()).toBe("shared");
      let returned = false;
      const result = new Promise((resolve, reject) => {
        named.readFile(path, "utf8", (error, value) => {
          expect(returned).toBe(true);
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        });
        returned = true;
      });
      await expect(result).resolves.toBe("shared");
    } finally {
      await handle.close();
    }
    await expect(handle.stat()).rejects.toMatchObject({ code: "EBADF" });
    const missing = join(root, "missing");
    await expect(namedPromises.readFile(missing)).rejects.toMatchObject({
      code: "ENOENT",
      path: missing,
    });
    expect(() => named.readFile(path, undefined, undefined)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
});
