import nodeFs from "node:fs";
import nodePromises from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { fs, promises } from "../helpers/fs.js";

describe("node:fs module contract", () => {
  test("exposes the Node 24 enumerable module shape", () => {
    expect(Object.keys(fs).sort()).toEqual(Object.keys(nodeFs).sort());
    expect(Object.keys(promises).sort()).toEqual(Object.keys(nodePromises).sort());
  });

  test("shares constants, promises, and compatibility class aliases", () => {
    expect(fs.promises).toBe(promises);
    expect(fs.constants).toBe(promises.constants);
    expect(fs.FileReadStream).toBe(fs.ReadStream);
    expect(fs.FileWriteStream).toBe(fs.WriteStream);
    expect(fs.constants.F_OK).toBe(0);
    expect(fs.constants.R_OK).toBe(4);
    expect(fs.constants.W_OK).toBe(2);
    expect(fs.constants.X_OK).toBe(1);
  });

  test("matches realpath compatibility function identities", () => {
    expect(fs.realpath.native).not.toBe(fs.realpath);
    expect(fs.realpathSync.native).not.toBe(fs.realpathSync);
    expect(typeof fs.realpath.native).toBe(typeof nodeFs.realpath.native);
    expect(typeof fs.realpathSync.native).toBe(typeof nodeFs.realpathSync.native);
  });

  test("pins Linux/WASI constants to Node 24 values", () => {
    expect(fs.constants).toEqual(nodeFs.constants);
  });
});
