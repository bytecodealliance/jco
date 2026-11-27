import os from "node:os";
import path from "node:path";
import process from "node:process";
import * as fs from "node:fs/promises";

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";

// Renaming a directory that is open, which every case here does, is refused on Windows
describe.skipIf(process.platform === "win32")("Descriptor directory handles", () => {
  let filesystem;
  /** Host directory holding `sandbox`, the preopen, next to `outside` */
  let root;
  /** Descriptor of the preopen */
  let preopen;

  beforeAll(async () => {
    ({ filesystem } = await import("@bytecodealliance/preview3-shim"));
  });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "preview3-handles-"));
    await fs.mkdir(host("sandbox/parent/victim"), { recursive: true });
    await fs.writeFile(host("sandbox/parent/victim/inside.txt"), "inside");
    await fs.mkdir(host("outside"));
    await fs.writeFile(host("outside/secret.txt"), "secret");

    filesystem._setPreopens({ "/": host("sandbox") });
    [[preopen]] = filesystem.preopens.getDirectories();
  });

  afterEach(async () => {
    filesystem._setPreopens({});
    await fs.rm(root, { recursive: true, force: true });
  });

  /**
   * Resolve a path below the temporary root
   *
   * @param {string} name Path relative to the root
   * @returns {string} The host path
   */
  function host(name) {
    return path.join(root, name);
  }

  /**
   * Open a directory below the preopen
   *
   * @param {string} name Path relative to the preopen
   * @returns {Promise<object>} The directory's descriptor
   */
  function openDirectory(name) {
    return preopen.openAt({}, name, { directory: true }, { read: true, mutateDirectory: true });
  }

  /**
   * List a directory through its descriptor
   *
   * @param {object} descriptor The directory's descriptor
   * @returns {Promise<string[]>} The sorted entry names
   */
  async function list(descriptor) {
    const [stream, future] = descriptor.readDirectory();
    const names = [];
    let entry;
    while ((entry = await stream.read()) !== null) {
      names.push(entry.name);
    }
    await future.read();
    return names.sort();
  }

  /**
   * Replace a directory below the root with a symlink to `outside`, keeping
   * the original under another name
   *
   * @param {string} name Path of the directory, relative to the root
   * @returns {Promise<void>}
   */
  async function swapForSymlinkToOutside(name) {
    await fs.rename(host(name), host(`${name}.moved`));
    // A relative target, as an absolute one is never followed in the first place
    const target = path.relative(path.dirname(host(name)), host("outside"));
    await fs.symlink(target, host(name), "dir");
  }

  /**
   * Run every mutating operation against a descriptor, ignoring failures
   *
   * @param {object} descriptor Directory descriptor to mutate through
   * @param {string} prefix Path prefix, ending in a separator unless empty
   * @returns {Promise<void>}
   */
  async function mutateThrough(descriptor, prefix) {
    const attempts = [
      () => descriptor.createDirectoryAt(`${prefix}created-dir`),
      () => descriptor.openAt({}, `${prefix}created-file`, { create: true }, { write: true }),
      () => descriptor.symlinkAt("target", `${prefix}created-link`),
      () => descriptor.renameAt(`${prefix}secret.txt`, descriptor, `${prefix}renamed.txt`),
      () => descriptor.linkAt({}, `${prefix}secret.txt`, descriptor, `${prefix}linked.txt`),
      () => descriptor.unlinkFileAt(`${prefix}secret.txt`),
      () => descriptor.setTimesAt({}, `${prefix}secret.txt`, timestamp(1n), timestamp(1n)),
      () => descriptor.removeDirectoryAt(`${prefix}created-dir`),
    ];
    for (const attempt of attempts) {
      const opened = await attempt().catch(() => undefined);
      opened?.[Symbol.dispose]?.();
    }
  }

  /**
   * Build a `new-timestamp` for a point in time
   *
   * @param {bigint} seconds Seconds since the epoch
   * @returns {object} The `new-timestamp`
   */
  function timestamp(seconds) {
    return { tag: "timestamp", val: { seconds, nanoseconds: 0 } };
  }

  /**
   * Assert that nothing outside of the preopen was created, removed or changed
   *
   * @returns {Promise<void>}
   */
  async function expectOutsideUntouched() {
    expect(await fs.readdir(host("outside"))).toEqual(["secret.txt"]);
    expect(await fs.readFile(host("outside/secret.txt"), "utf8")).toBe("secret");
    expect((await fs.stat(host("outside/secret.txt"))).mtimeMs).toBeGreaterThan(1000);
  }

  test("a descriptor keeps its directory when its path becomes a symlink to outside", async () => {
    const victim = await openDirectory("parent/victim");
    await swapForSymlinkToOutside("sandbox/parent/victim");

    await expect(victim.statAt({}, "secret.txt")).rejects.toMatchObject({
      payload: { tag: "no-entry" },
    });
    await expect(victim.openAt({}, "secret.txt", {}, { read: true })).rejects.toMatchObject({
      payload: { tag: "no-entry" },
    });
    expect((await victim.statAt({}, "inside.txt")).size).toBe(6n);

    victim[Symbol.dispose]();
  });

  test("a descriptor keeps its directory when a parent becomes a symlink to outside", async () => {
    const victim = await openDirectory("parent/victim");
    await swapForSymlinkToOutside("sandbox/parent");

    expect(await list(victim)).toEqual(["inside.txt"]);
    await expect(victim.statAt({}, "../secret.txt")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });

    // The path leads outside now, so it is refused when resolved again
    await expect(
      preopen.statAt({ symlinkFollow: true }, "parent/secret.txt"),
    ).rejects.toMatchObject({ payload: { tag: "not-permitted" } });
    await expect(
      preopen.openAt({ symlinkFollow: true }, "parent", { directory: true }, { read: true }),
    ).rejects.toMatchObject({ payload: { tag: "not-permitted" } });

    victim[Symbol.dispose]();
  });

  test("mutating operations on a stale descriptor stay in its directory", async () => {
    const victim = await openDirectory("parent/victim");
    await swapForSymlinkToOutside("sandbox/parent/victim");

    await mutateThrough(victim, "");
    await mutateThrough(preopen, "parent/victim/");
    await expectOutsideUntouched();

    const moved = await fs.readdir(host("sandbox/parent/victim.moved"));
    expect(moved.sort()).toEqual(["created-file", "created-link", "inside.txt"]);

    victim[Symbol.dispose]();
  });

  test("read-directory on a stale descriptor lists the original directory", async () => {
    const victim = await openDirectory("parent/victim");
    await swapForSymlinkToOutside("sandbox/parent/victim");

    expect(await list(victim)).toEqual(["inside.txt"]);

    victim[Symbol.dispose]();
  });

  test("a preopen keeps its directory when its path becomes a symlink to outside", async () => {
    expect(await list(preopen)).toEqual(["parent"]);
    await swapForSymlinkToOutside("sandbox");

    expect(await list(preopen)).toEqual(["parent"]);
    await mutateThrough(preopen, "");
    await expectOutsideUntouched();
  });

  test("symlinks that stay inside the preopen are followed", async () => {
    await preopen.symlinkAt("parent/victim", "shortcut");
    await preopen.symlinkAt("../victim/inside.txt", "parent/victim/self.txt");

    const victim = await preopen.openAt(
      { symlinkFollow: true },
      "shortcut",
      { directory: true },
      { read: true },
    );
    expect(await list(victim)).toEqual(["inside.txt", "self.txt"]);
    expect((await preopen.statAt({ symlinkFollow: true }, "shortcut/self.txt")).type).toEqual({
      tag: "regular-file",
    });
    expect(await preopen.readlinkAt("shortcut")).toBe("parent/victim");

    victim[Symbol.dispose]();
  });

  test("rearranging the tree between two operations cannot lead outside", async () => {
    const victim = await openDirectory("parent/victim");

    // The first two operations run off the main thread while the tree is
    // rearranged, and the last two start after
    const first = victim.createDirectoryAt("first");
    const second = preopen.createDirectoryAt("parent/victim/second").catch((error) => error);
    await swapForSymlinkToOutside("sandbox/parent/victim");
    const third = victim.createDirectoryAt("third");
    const fourth = preopen.createDirectoryAt("parent/victim/fourth").catch((error) => error);

    await Promise.all([first, third]);
    expect(await fourth).toMatchObject({ payload: { tag: "not-permitted" } });

    // The path of the second operation is resolved before, during or after
    // the rearrangement: it reaches the original directory or fails
    const raced = await second;
    if (raced !== undefined) {
      expect(["no-entry", "not-permitted"]).toContain(raced.payload?.tag);
    }

    await expectOutsideUntouched();
    const moved = await fs.readdir(host("sandbox/parent/victim.moved"));
    const expected = ["first", "inside.txt", "third"];
    if (raced === undefined) {
      expected.push("second");
    }
    expect(moved.sort()).toEqual(expected.sort());

    victim[Symbol.dispose]();
  });
});
