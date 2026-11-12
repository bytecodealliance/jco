import os from "node:os";
import path from "node:path";
import process from "node:process";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const { stream } = await import("@bytecodealliance/preview3-shim/stream");
const ADVICE_VALUES = ["normal", "sequential", "random", "will-need", "dont-need", "no-reuse"];

describe("Descriptor with os.tmpdir()", () => {
  let filesystem;
  let rootDescriptor;
  let tmpDir;
  let relBase;

  beforeAll(async () => {
    ({ filesystem } = await import("@bytecodealliance/preview3-shim"));

    const ROOT_PREOPEN = process.platform === "win32" ? "//" : "/";
    filesystem._addPreopen("/", ROOT_PREOPEN);

    [[rootDescriptor]] = filesystem.preopens.getDirectories();

    const base = os.tmpdir();
    tmpDir = await fs.mkdtemp(path.join(base, "preview3-test-"));

    const rootPath = path.parse(tmpDir).root;
    relBase = path.relative(rootPath, tmpDir).replaceAll(path.sep, "/");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("read current test module contains UNIQUE STRING", async () => {
    // reuse the same rootDescriptor from beforeAll
    const subpath = fileURLToPath(import.meta.url).slice(1);
    const child = await rootDescriptor.openAt({}, subpath, {}, {});

    const [stream, future] = child.readViaStream(0n);
    const buf = await stream.readAll();
    const text = new TextDecoder().decode(buf);
    expect(text).toContain("UNIQUE STRING");

    await future.read();
    child[Symbol.dispose]?.();
  });

  test("advise accepts every WASI advice value", async () => {
    const subpath = fileURLToPath(import.meta.url).slice(1);
    const child = await rootDescriptor.openAt({}, subpath, {}, { read: true });

    for (const advice of ADVICE_VALUES) {
      await expect(child.advise(0n, 0n, advice)).resolves.toBeUndefined();
    }

    child[Symbol.dispose]?.();
  });

  test("writeViaStream <=> readViaStream round-trip", async () => {
    const sub = `${relBase}/file-write.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );

    const { tx, rx } = stream();
    await tx.write("Hello ");
    await tx.write("Preview3!");
    await tx.close();
    await child.writeViaStream(rx, 0);

    const [sr, fr] = child.readViaStream(0n);
    const buf = await sr.readAll();
    await fr.read();

    expect(new TextDecoder().decode(buf)).toBe("Hello Preview3!");

    child[Symbol.dispose]?.();
  });

  test("writeViaStream accepts non zero offsets", async () => {
    const sub = `${relBase}/file-write-offset.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );

    const { tx, rx } = stream();
    await tx.write("Hello, World!");
    await tx.close();
    await child.writeViaStream(rx, 5n);

    const [sr, fr] = child.readViaStream(0n);
    const buf = await sr.readAll();
    await fr.read();

    expect(buf).toEqual(Buffer.from("\0\0\0\0\0Hello, World!"));

    child[Symbol.dispose]?.();
  });

  test("readViaStream accepts non zero offsets", async () => {
    const sub = `${relBase}/file-read-offset.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );

    const { tx, rx } = stream();
    await tx.write("skip-read");
    await tx.close();
    await child.writeViaStream(rx, 5n);

    const [sr, fr] = child.readViaStream(5n);
    const buf = await sr.readAll();
    await fr.read();

    expect(new TextDecoder().decode(buf)).toBe("skip-read");

    child[Symbol.dispose]?.();
  });

  test("readViaStream reports invalid offsets through its future", async () => {
    const sub = `${relBase}/file-read-invalid-offset.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );

    const [sr, fr] = child.readViaStream(BigInt(Number.MAX_SAFE_INTEGER) + 1n);

    await expect(sr.readAll()).resolves.toEqual(Buffer.alloc(0));
    await expect(fr.read()).rejects.toMatchObject({
      payload: { tag: "invalid" },
    });

    child[Symbol.dispose]?.();
  });

  test("writeViaStream rejects read-only descriptors before consuming data", async () => {
    const sub = `${relBase}/file-read-only-write.txt`;
    const writable = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );
    writable[Symbol.dispose]?.();

    const readOnly = await rootDescriptor.openAt({}, sub, {}, { read: true });
    const reader = {
      read: vi.fn(async () => Uint8Array.of(1)),
    };

    await expect(readOnly.writeViaStream(reader, 0n)).rejects.toThrow();
    expect(reader.read).not.toHaveBeenCalled();

    readOnly[Symbol.dispose]?.();
  });

  test("appendViaStream <=> readViaStream round-trip", async () => {
    const sub = `${relBase}/file-append.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );

    {
      const { tx, rx } = stream();
      await tx.write("A");
      await tx.close();

      await child.writeViaStream(rx, 0);
    }

    {
      const { tx, rx } = stream();
      await tx.write("B");
      await tx.close();

      await child.appendViaStream(rx);
    }

    expect((await child.stat()).size).toBe(2n);

    const [sr, fr] = child.readViaStream(0n);
    const buf = await sr.readAll();
    await fr.read();

    expect(new TextDecoder().decode(buf)).toBe("AB");
    child[Symbol.dispose]?.();
  });

  test("createDirectoryAt => readDirectory => removeDirectoryAt", async () => {
    const dirDesc = await rootDescriptor.openAt({}, relBase, { directory: true }, { read: true });

    const readDir = async () => {
      const [stream, future] = dirDesc.readDirectory();
      const entries = [];
      let entry;
      while ((entry = await stream.read()) !== null) {
        entries.push(entry);
      }
      await future.read();
      return entries;
    };

    await dirDesc.createDirectoryAt("subdir");

    const entriesAfterCreate = await readDir();
    expect(entriesAfterCreate.some((e) => e.name === "subdir")).toBe(true);

    await dirDesc.removeDirectoryAt("subdir");

    const entriesAfterRemove = await readDir();
    expect(entriesAfterRemove.some((e) => e.name === "subdir")).toBe(false);

    dirDesc[Symbol.dispose]?.();
  });

  test("readDirectory works on preopen descriptors", async () => {
    const entryName = "preopen-entry.txt";
    await fs.writeFile(path.join(tmpDir, entryName), "");

    const virtualPath = `/preview3-test-${path.basename(tmpDir)}`;
    filesystem._addPreopen(virtualPath, tmpDir);
    const [preopen] = filesystem.preopens
      .getDirectories()
      .find(([_desc, path]) => path === virtualPath);

    const [stream, future] = preopen.readDirectory();
    const entries = [];
    let entry;
    while ((entry = await stream.read()) !== null) {
      entries.push(entry);
    }
    await future.read();

    expect(entries.some((e) => e.name === entryName)).toBe(true);
  });

  test("preopen descriptors expose directory mutation flags", async () => {
    const virtualPath = `/preview3-test-flags-${path.basename(tmpDir)}`;
    filesystem._addPreopen(virtualPath, tmpDir);
    const [preopen] = filesystem.preopens
      .getDirectories()
      .find(([_desc, path]) => path === virtualPath);

    await expect(preopen.getFlags()).resolves.toMatchObject({
      read: true,
      mutateDirectory: true,
    });
  });

  test("openAt reports effective descriptor flags", async () => {
    const defaultSub = `${relBase}/flags-default.txt`;
    await fs.writeFile(path.join(tmpDir, "flags-default.txt"), "");
    const defaultDesc = await rootDescriptor.openAt({}, defaultSub, {}, {});
    await expect(defaultDesc.getFlags()).resolves.toMatchObject({
      read: true,
      write: false,
    });
    defaultDesc[Symbol.dispose]?.();

    const createDefaultSub = `${relBase}/flags-create-default.txt`;
    const createDefaultDesc = await rootDescriptor.openAt(
      {},
      createDefaultSub,
      { create: true, exclusive: true },
      {},
    );
    await expect(createDefaultDesc.getFlags()).resolves.toMatchObject({
      read: true,
      write: true,
    });
    createDefaultDesc[Symbol.dispose]?.();

    const createReadSub = `${relBase}/flags-create-read.txt`;
    const createReadDesc = await rootDescriptor.openAt(
      {},
      createReadSub,
      { create: true, exclusive: true },
      { read: true },
    );
    await expect(createReadDesc.getFlags()).resolves.toMatchObject({
      read: true,
      write: true,
    });
    createReadDesc[Symbol.dispose]?.();

    const createWriteSub = `${relBase}/flags-create-write.txt`;
    const createWriteDesc = await rootDescriptor.openAt(
      {},
      createWriteSub,
      { create: true, exclusive: true },
      { write: true },
    );
    await expect(createWriteDesc.getFlags()).resolves.toMatchObject({
      read: false,
      write: true,
    });
    createWriteDesc[Symbol.dispose]?.();
  });

  test("empty relative paths reject with no-entry", async () => {
    const dirDesc = await rootDescriptor.openAt(
      {},
      relBase,
      { directory: true },
      { read: true, mutateDirectory: true },
    );

    await expect(dirDesc.openAt({}, "", {}, { read: true })).rejects.toMatchObject({
      payload: { tag: "no-entry" },
    });
    await expect(dirDesc.createDirectoryAt("")).rejects.toMatchObject({
      payload: { tag: "no-entry" },
    });
    await expect(dirDesc.unlinkFileAt("")).rejects.toMatchObject({
      payload: { tag: "no-entry" },
    });
    await expect(dirDesc.linkAt({}, "", dirDesc, "x")).rejects.toMatchObject({
      payload: { tag: "no-entry" },
    });

    dirDesc[Symbol.dispose]?.();
  });

  test("path operations reject symlink escapes from preopen", async () => {
    const dirDesc = await rootDescriptor.openAt(
      {},
      relBase,
      { directory: true },
      { read: true, mutateDirectory: true },
    );

    await dirDesc.symlinkAt("..", "parent.cleanup");

    await expect(dirDesc.createDirectoryAt("parent.cleanup/out")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(dirDesc.statAt({ symlinkFollow: true }, "parent.cleanup")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(dirDesc.linkAt({}, "parent.cleanup/out", dirDesc, "x")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(dirDesc.renameAt("a.txt", dirDesc, "parent.cleanup/out")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(dirDesc.unlinkFileAt("parent.cleanup/out")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });

    await fs.unlink(path.join(tmpDir, "parent.cleanup"));
    dirDesc[Symbol.dispose]?.();
  });

  test("normalizes paths before checking symlink confinement", async () => {
    const dirDesc = await rootDescriptor.openAt(
      {},
      relBase,
      { directory: true },
      { read: true, mutateDirectory: true },
    );
    const outside = await fs.mkdtemp(`${tmpDir}-outside-`);

    try {
      await fs.writeFile(path.join(outside, "secret.txt"), "outside");
      await dirDesc.symlinkAt(`../${path.basename(outside)}`, "escape.cleanup");

      const escapedPath = "missing/../escape.cleanup/secret.txt";
      await expect(
        dirDesc.openAt({ symlinkFollow: true }, escapedPath, {}, { read: true }),
      ).rejects.toMatchObject({ payload: { tag: "not-permitted" } });
      await expect(dirDesc.statAt({ symlinkFollow: true }, escapedPath)).rejects.toMatchObject({
        payload: { tag: "not-permitted" },
      });
      await expect(
        dirDesc.createDirectoryAt("missing/../escape.cleanup/created"),
      ).rejects.toMatchObject({ payload: { tag: "not-permitted" } });
      await expect(fs.stat(path.join(outside, "created"))).rejects.toMatchObject({
        code: "ENOENT",
      });

      await dirDesc.createDirectoryAt("inside");
      await fs.writeFile(path.join(tmpDir, "inside", "allowed.txt"), "inside");
      await dirDesc.symlinkAt("inside", "inside.cleanup");
      const allowed = await dirDesc.openAt(
        { symlinkFollow: true },
        "missing/../inside.cleanup/allowed.txt",
        {},
        { read: true },
      );
      allowed[Symbol.dispose]?.();
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
      await fs.rm(path.join(tmpDir, "escape.cleanup"), { force: true });
      await fs.rm(path.join(tmpDir, "inside.cleanup"), { force: true });
      dirDesc[Symbol.dispose]?.();
    }
  });

  test("path operations reject non-directory base descriptors", async () => {
    const sub = `${relBase}/not-dir-base.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );

    await expect(child.statAt({}, ".")).rejects.toMatchObject({
      payload: { tag: "not-directory" },
    });
    await expect(child.openAt({}, ".", {}, { read: true })).rejects.toMatchObject({
      payload: { tag: "not-directory" },
    });

    child[Symbol.dispose]?.();
  });

  test("removeDirectoryAt rejects current directory", async () => {
    const dirDesc = await rootDescriptor.openAt(
      {},
      relBase,
      { directory: true },
      { read: true, mutateDirectory: true },
    );

    await expect(dirDesc.removeDirectoryAt(".")).rejects.toMatchObject({
      payload: { tag: "invalid" },
    });

    dirDesc[Symbol.dispose]?.();
  });

  test("isSameObject & metadataHash vs metadataHashAt", async () => {
    const sub = `${relBase}/file3.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );

    expect(await child.isSameObject(child)).toBe(true);
    const h1 = await child.metadataHash();

    const h2 = await rootDescriptor.metadataHashAt({ symlinkFollow: true }, sub);

    expect(h2.lower).toBe(h1.lower);
    child[Symbol.dispose]?.();
  });

  test("stat returns correct timestamp fields seconds and nanoseconds", async () => {
    const statSub = `${relBase}/stat-test.txt`;
    const statDesc = await rootDescriptor.openAt(
      {},
      statSub,
      { create: true },
      { read: true, write: true },
    );

    const { tx, rx } = stream();
    await tx.write("x");
    await tx.close();
    await statDesc.writeViaStream(rx, 0);

    const statInfo = await statDesc.stat();
    expect(typeof statInfo.size).toBe("bigint");
    expect(typeof statInfo.dataAccessTimestamp.seconds).toBe("bigint");
    expect(typeof statInfo.dataAccessTimestamp.nanoseconds).toBe("number");
    expect(statInfo.dataAccessTimestamp.nanoseconds).toBeLessThan(1_000_000_000);

    statDesc[Symbol.dispose]?.();
  });

  test("statAt returns correct stats and respects symlinkFollow", async () => {
    const fileSub = `${relBase}/statat-file.txt`;
    const child = await rootDescriptor.openAt(
      {},
      fileSub,
      { create: true },
      { read: true, write: true },
    );

    const { tx, rx } = stream();
    await tx.write("x");
    await tx.close();
    await child.writeViaStream(rx, 0);

    const stats1 = await rootDescriptor.statAt({ symlinkFollow: false }, fileSub);

    expect(stats1.type).toEqual({ tag: "regular-file" });
    expect(typeof stats1.size).toBe("bigint");
    expect(typeof stats1.dataAccessTimestamp.seconds).toBe("bigint");
    expect(typeof stats1.dataAccessTimestamp.nanoseconds).toBe("number");
    child[Symbol.dispose]?.();

    const realPath = path.join(tmpDir, "statat-file.txt");
    const linkSub = `${relBase}/statat-link.txt`;
    const linkPath = path.join(tmpDir, "statat-link.txt");
    await fs.symlink(realPath, linkPath);

    const stats2 = await rootDescriptor.statAt({ symlinkFollow: false }, linkSub);
    expect(stats2.type).toEqual({ tag: "symbolic-link" });

    const stats3 = await rootDescriptor.statAt({ symlinkFollow: true }, linkSub);
    expect(stats3.type).toEqual({ tag: "regular-file" });
  });
});

describe("Descriptor#setTimes and #setTimesAt", () => {
  let filesystem;
  let rootDescriptor;
  let tmpDir;
  let relBase;

  beforeAll(async () => {
    ({ filesystem } = await import("@bytecodealliance/preview3-shim"));

    const ROOT_PREOPEN = process.platform === "win32" ? "//" : "/";
    filesystem._addPreopen("/", ROOT_PREOPEN);

    [[rootDescriptor]] = filesystem.preopens.getDirectories();

    const base = os.tmpdir();
    tmpDir = await fs.mkdtemp(path.join(base, "preview3-test-"));

    const rootPath = path.parse(tmpDir).root;
    relBase = path.relative(rootPath, tmpDir).replaceAll(path.sep, "/");

    const subDir = `${relBase}/time-test-dir`;
    await rootDescriptor.createDirectoryAt(subDir);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.useFakeTimers({ now: Date.now(), toFake: ["setTimeout", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function datetimeToNumber({ seconds, nanoseconds }) {
    return Number(seconds) + nanoseconds / 1e9;
  }

  test("setTimes: timestamp and no-change variants", async () => {
    const sub = `${relBase}/times-fake-tsnc.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );
    const { tx, rx } = stream();
    await tx.write("A");
    await tx.close();
    await child.writeViaStream(rx, 0);

    const before = await child.stat();

    // timestamp variant
    await child.setTimes(
      { tag: "timestamp", val: before.dataAccessTimestamp },
      { tag: "timestamp", val: before.dataModificationTimestamp },
    );
    const afterTs = await child.stat();

    expect(afterTs.dataAccessTimestamp.seconds).toBe(before.dataAccessTimestamp.seconds);
    expect(datetimeToNumber(afterTs.dataAccessTimestamp)).toBeCloseTo(
      datetimeToNumber(before.dataAccessTimestamp),
      3,
    );
    expect(afterTs.dataModificationTimestamp.seconds).toBe(
      before.dataModificationTimestamp.seconds,
    );
    expect(datetimeToNumber(afterTs.dataModificationTimestamp)).toBeCloseTo(
      datetimeToNumber(before.dataModificationTimestamp),
      3,
    );

    // no-change variant
    await child.setTimes({ tag: "no-change" }, { tag: "no-change" });
    const afterNc = await child.stat();

    expect(afterNc.dataAccessTimestamp.seconds).toBe(before.dataAccessTimestamp.seconds);
    expect(datetimeToNumber(afterNc.dataAccessTimestamp)).toBeCloseTo(
      datetimeToNumber(before.dataAccessTimestamp),
      3,
    );
    expect(afterNc.dataModificationTimestamp.seconds).toBe(
      before.dataModificationTimestamp.seconds,
    );
    expect(datetimeToNumber(afterNc.dataModificationTimestamp)).toBeCloseTo(
      datetimeToNumber(before.dataModificationTimestamp),
      3,
    );

    child[Symbol.dispose]?.();
  });

  test("setTimes: now variant advances time", async () => {
    const sub = `${relBase}/times-fake-now.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );
    const { tx, rx } = stream();
    await tx.write("B");
    await tx.close();
    await child.writeViaStream(rx, 0);

    const before = await child.stat();
    vi.advanceTimersByTime(5000);

    await child.setTimes({ tag: "now" }, { tag: "now" });
    const after = await child.stat();

    expect(after.dataAccessTimestamp.seconds).toBeGreaterThan(before.dataAccessTimestamp.seconds);
    expect(after.dataModificationTimestamp.seconds).toBeGreaterThan(
      before.dataModificationTimestamp.seconds,
    );

    child[Symbol.dispose]?.();
  });

  test("setTimesAt: timestamp and no-change variants", async () => {
    const sub = `${relBase}/timesat-fake-tsnc.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );
    const { tx, rx } = stream();
    await tx.write("C");
    await tx.close();
    await child.writeViaStream(rx, 0);

    const before = await rootDescriptor.statAt({ symlinkFollow: true }, sub);

    await rootDescriptor.setTimesAt(
      { symlinkFollow: true },
      sub,
      { tag: "timestamp", val: before.dataAccessTimestamp },
      { tag: "timestamp", val: before.dataModificationTimestamp },
    );
    const afterTs = await rootDescriptor.statAt({ symlinkFollow: true }, sub);
    expect(afterTs.dataAccessTimestamp.seconds).toBe(before.dataAccessTimestamp.seconds);
    expect(datetimeToNumber(afterTs.dataAccessTimestamp)).toBeCloseTo(
      datetimeToNumber(before.dataAccessTimestamp),
      3,
    );
    expect(afterTs.dataModificationTimestamp.seconds).toBe(
      before.dataModificationTimestamp.seconds,
    );
    expect(datetimeToNumber(afterTs.dataModificationTimestamp)).toBeCloseTo(
      datetimeToNumber(before.dataModificationTimestamp),
      3,
    );

    await rootDescriptor.setTimesAt(
      { symlinkFollow: true },
      sub,
      { tag: "no-change" },
      { tag: "no-change" },
    );
    const afterNc = await rootDescriptor.statAt({ symlinkFollow: true }, sub);
    expect(afterNc.dataAccessTimestamp.seconds).toBe(before.dataAccessTimestamp.seconds);
    expect(datetimeToNumber(afterNc.dataAccessTimestamp)).toBeCloseTo(
      datetimeToNumber(before.dataAccessTimestamp),
      3,
    );
    expect(afterNc.dataModificationTimestamp.seconds).toBe(
      before.dataModificationTimestamp.seconds,
    );
    expect(datetimeToNumber(afterNc.dataModificationTimestamp)).toBeCloseTo(
      datetimeToNumber(before.dataModificationTimestamp),
      3,
    );

    child[Symbol.dispose]?.();
  });

  test("setTimesAt: now variant advances time", async () => {
    const sub = `${relBase}/timesat-fake-now.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );
    const { tx, rx } = stream();
    await tx.write("D");
    await tx.close();
    await child.writeViaStream(rx, 0);

    const before = await rootDescriptor.statAt({ symlinkFollow: true }, sub);
    vi.advanceTimersByTime(3000);

    await rootDescriptor.setTimesAt({ symlinkFollow: true }, sub, { tag: "now" }, { tag: "now" });
    const after = await rootDescriptor.statAt({ symlinkFollow: true }, sub);
    expect(after.dataAccessTimestamp.seconds).toBeGreaterThan(before.dataAccessTimestamp.seconds);
    expect(after.dataModificationTimestamp.seconds).toBeGreaterThan(
      before.dataModificationTimestamp.seconds,
    );

    child[Symbol.dispose]?.();
  });

  test("setTimes on directory preserves & advances correct timestamps", async () => {
    const dirSub = `${relBase}/time-test-dir`;
    const dirDesc = await rootDescriptor.openAt({}, dirSub, { directory: true }, { read: true });

    const before = await dirDesc.stat();

    vi.advanceTimersByTime(2000);
    await dirDesc.setTimes({ tag: "now" }, { tag: "now" });

    const afterNow = await dirDesc.stat();

    // Check that timestamps have advanced
    expect(afterNow.dataAccessTimestamp.seconds).toBeGreaterThan(
      before.dataAccessTimestamp.seconds,
    );
    expect(afterNow.dataModificationTimestamp.seconds).toBeGreaterThan(
      before.dataModificationTimestamp.seconds,
    );

    await dirDesc.setTimes(
      { tag: "timestamp", val: afterNow.dataAccessTimestamp },
      { tag: "timestamp", val: afterNow.dataModificationTimestamp },
    );
    const afterTs = await dirDesc.stat();
    expect(datetimeToNumber(afterTs.dataAccessTimestamp)).toBeCloseTo(
      datetimeToNumber(afterNow.dataAccessTimestamp),
      3,
    );

    dirDesc[Symbol.dispose]?.();
  });

  test("setTimesAt on directory advances timestamps", async () => {
    const dirSub = `${relBase}/time-test-dir`;
    const beforeAt = await rootDescriptor.statAt({ symlinkFollow: true }, dirSub);

    vi.advanceTimersByTime(3000);
    await rootDescriptor.setTimesAt(
      { symlinkFollow: true },
      dirSub,
      { tag: "now" },
      { tag: "now" },
    );

    const afterAt = await rootDescriptor.statAt({ symlinkFollow: true }, dirSub);

    expect(afterAt.dataAccessTimestamp.seconds).toBeGreaterThan(
      beforeAt.dataAccessTimestamp.seconds,
    );
    expect(afterAt.dataModificationTimestamp.seconds).toBeGreaterThan(
      beforeAt.dataModificationTimestamp.seconds,
    );
  });
});

/**
 * Add a preopen for a new temporary directory
 *
 * @param {string} prefix Prefix for the temporary directory's name
 * @returns {Promise<{ tmpDir: string, preopen: object }>} The directory and its preopen descriptor
 */
async function addTmpPreopen(prefix) {
  const { filesystem } = await import("@bytecodealliance/preview3-shim");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const virtualPath = `/${path.basename(tmpDir)}`;
  filesystem._addPreopen(virtualPath, tmpDir);
  const [preopen] = filesystem.preopens
    .getDirectories()
    .find(([_desc, preopenPath]) => preopenPath === virtualPath);
  return { tmpDir, preopen };
}

/**
 * Report how a promise settles, or "pending" if it has not settled within `ms`
 *
 * @param {Promise<unknown>} promise The promise to observe
 * @param {number} ms How long to wait for it
 * @returns {Promise<"resolved" | "rejected" | "pending">}
 */
async function settlement(promise, ms) {
  let timer;
  const pending = new Promise((resolve) => {
    timer = setTimeout(() => resolve("pending"), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        () => "resolved",
        () => "rejected",
      ),
      pending,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build file contents whose bytes differ between chunks and between files
 *
 * @param {number} length Number of bytes
 * @param {number} seed Value that distinguishes one file's contents from another's
 * @returns {Buffer}
 */
function patternedBytes(length, seed) {
  const bytes = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = (seed * 31 + Math.floor(i / 4096) * 7 + i) % 256;
  }
  return bytes;
}

describe("Descriptor stream operations", () => {
  const CHUNK_BYTES = 64 * 1024;
  let tmpDir;
  let preopen;

  beforeAll(async () => {
    ({ tmpDir, preopen } = await addTmpPreopen("preview3-stream-ops-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // A guest can drop a descriptor without awaiting a write it started, Rust's
  // `std::fs::write` does this once the stream has accepted the last bytes
  test("writeViaStream finishes after the descriptor is dropped", async () => {
    const data = patternedBytes(4 * 1024 * 1024 + 7, 1);
    const file = await preopen.openAt(
      {},
      "dropped-write.bin",
      { create: true, truncate: true },
      { write: true },
    );

    async function* chunks() {
      for (let offset = 0; offset < data.length; offset += CHUNK_BYTES) {
        yield data.subarray(offset, offset + CHUNK_BYTES);
      }
    }
    const write = file.writeViaStream(chunks(), 0n);
    file[Symbol.dispose]();

    await expect(write).resolves.toBeUndefined();
    const written = await fs.readFile(path.join(tmpDir, "dropped-write.bin"));
    expect(written.length).toBe(data.length);
    expect(written.equals(data)).toBe(true);
  });

  test("appendViaStream finishes after the descriptor is dropped", async () => {
    const prefix = Buffer.from("prefix:");
    const data = patternedBytes(4 * 1024 * 1024 + 7, 2);
    await fs.writeFile(path.join(tmpDir, "dropped-append.bin"), prefix);
    const file = await preopen.openAt({}, "dropped-append.bin", {}, { write: true });

    const { tx, rx } = stream();
    const append = file.appendViaStream(rx);
    file[Symbol.dispose]();
    for (let offset = 0; offset < data.length; offset += CHUNK_BYTES) {
      await tx.write(data.subarray(offset, offset + CHUNK_BYTES));
    }
    await tx.close();

    await expect(append).resolves.toBeUndefined();
    const written = await fs.readFile(path.join(tmpDir, "dropped-append.bin"));
    expect(written.length).toBe(prefix.length + data.length);
    expect(written.equals(Buffer.concat([prefix, data]))).toBe(true);
  });

  test("readViaStream finishes after the descriptor is dropped", async () => {
    const data = patternedBytes(16 * CHUNK_BYTES + 7, 3);
    await fs.writeFile(path.join(tmpDir, "dropped-read.bin"), data);
    const file = await preopen.openAt({}, "dropped-read.bin", {}, { read: true });

    const [reader, future] = file.readViaStream(0n);
    file[Symbol.dispose]();

    const read = await reader.readAll();
    await expect(future.read()).resolves.toBeDefined();
    expect(read.length).toBe(data.length);
    expect(read.equals(data)).toBe(true);
  });

  // The filesystem worker hands each chunk to the reader's thread when the
  // reader pulls it, so a chunk cannot share its buffer with another read
  test("concurrent readViaStream operations each read their own file", async () => {
    const files = [4, 5, 6, 7].map((seed) => ({
      name: `concurrent-read-${seed}.bin`,
      data: patternedBytes(4 * CHUNK_BYTES, seed),
    }));
    for (const { name, data } of files) {
      await fs.writeFile(path.join(tmpDir, name), data);
    }

    const descriptors = await Promise.all(
      files.map(({ name }) => preopen.openAt({}, name, {}, { read: true })),
    );
    const reads = descriptors.map((descriptor) => descriptor.readViaStream(0n));
    const contents = await Promise.all(reads.map(([reader]) => reader.readAll()));
    await Promise.all(reads.map(([, future]) => future.read()));

    for (const [index, { data }] of files.entries()) {
      expect(contents[index].length).toBe(data.length);
      expect(contents[index].equals(data), `contents of ${files[index].name}`).toBe(true);
    }
    for (const descriptor of descriptors) {
      descriptor[Symbol.dispose]();
    }
  });

  // Generated bindings read a host stream through its async iterator and call
  // `return()` on it when the guest drops the stream. Host code calls `close()`.
  // Both work with the async iterator protocol
  const READER_RELEASES = [
    ["the async iterator is returned", (reader) => reader[Symbol.asyncIterator]()],
    [
      "the reader is closed",
      (reader) => ({
        async next() {
          const value = await reader.read();
          return { value, done: value === null };
        },
        async return() {
          reader.close();
        },
      }),
    ],
  ];

  test.each(READER_RELEASES)(
    "dropping a readViaStream stream ends the read when %s",
    async (_name, iterate) => {
      await fs.writeFile(
        path.join(tmpDir, "dropped-stream.bin"),
        patternedBytes(16 * CHUNK_BYTES, 8),
      );
      const file = await preopen.openAt({}, "dropped-stream.bin", {}, { read: true });

      const [reader, future] = file.readViaStream(0n);
      const iterator = iterate(reader);
      await iterator.next();
      await iterator.return();

      // As in Wasmtime, a read that ends because its stream was dropped succeeds
      expect(await settlement(future.read(), 5_000)).toBe("resolved");
      file[Symbol.dispose]();
    },
  );

  test.each(READER_RELEASES)(
    "dropping a readDirectory stream ends the listing when %s",
    async (_name, iterate) => {
      // Enough entries that the worker is still listing when the stream is dropped
      const listingPath = path.join(tmpDir, "dropped-listing");
      await fs.rm(listingPath, { recursive: true, force: true });
      await fs.mkdir(listingPath);
      for (let i = 0; i < 32; i++) {
        await fs.writeFile(path.join(listingPath, `entry-${i}.txt`), "");
      }
      const directory = await preopen.openAt(
        {},
        "dropped-listing",
        { directory: true },
        { read: true },
      );

      const [reader, future] = directory.readDirectory();
      const iterator = iterate(reader);
      await expect(iterator.next()).resolves.toMatchObject({
        value: { type: { tag: "regular-file" } },
      });
      await iterator.return();

      // As in Wasmtime, a listing that ends because its stream was dropped succeeds
      expect(await settlement(future.read(), 5_000)).toBe("resolved");
      directory[Symbol.dispose]();
    },
  );
});

describe("Descriptor path operations on a symlink that leads outside the directory", () => {
  let tmpDir;
  let preopen;
  let sub;

  beforeAll(async () => {
    ({ tmpDir, preopen } = await addTmpPreopen("preview3-symlink-escape-"));
    await fs.mkdir(path.join(tmpDir, "dir/sub"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "dir/outside.txt"), "outside");
    sub = await preopen.openAt(
      { symlinkFollow: true },
      "dir/sub",
      { directory: true },
      {
        read: true,
        mutateDirectory: true,
      },
    );
  });

  afterAll(async () => {
    sub[Symbol.dispose]();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // Each test gets a fresh `sub/loop -> ..`, which leads from `sub` to its parent
  beforeEach(async () => {
    await fs.rm(path.join(tmpDir, "dir/sub/loop"), { force: true });
    await fs.symlink("..", path.join(tmpDir, "dir/sub/loop"));
  });

  test("statAt without symlink-follow returns the symlink's own metadata", async () => {
    const stat = await sub.statAt({ symlinkFollow: false }, "loop");
    expect(stat.type).toEqual({ tag: "symbolic-link" });
  });

  test("metadataHashAt without symlink-follow hashes the symlink itself", async () => {
    const linkStat = await fs.lstat(path.join(tmpDir, "dir/sub/loop"), { bigint: true });
    const hash = await sub.metadataHashAt({ symlinkFollow: false }, "loop");
    expect(hash.lower).toBe(linkStat.ino);
  });

  test("readlinkAt returns the symlink's relative target", async () => {
    await expect(sub.readlinkAt("loop")).resolves.toBe("..");
  });

  test("readlinkAt rejects an absolute target", async () => {
    const absoluteLink = path.join(tmpDir, "dir/sub/absolute.cleanup");
    await fs.symlink(path.join(tmpDir, "dir/outside.txt"), absoluteLink);
    try {
      await expect(sub.readlinkAt("absolute.cleanup")).rejects.toMatchObject({
        payload: { tag: "not-permitted" },
      });
    } finally {
      await fs.rm(absoluteLink, { force: true });
    }
  });

  test("setTimesAt without symlink-follow updates only the symlink", async () => {
    const linkPath = path.join(tmpDir, "dir/sub/loop");
    await fs.lutimes(linkPath, 1_000, 2_000);
    const targetBefore = await fs.stat(path.join(tmpDir, "dir"));

    await sub.setTimesAt(
      { symlinkFollow: false },
      "loop",
      { tag: "no-change" },
      { tag: "timestamp", val: { seconds: 3_000n, nanoseconds: 0 } },
    );

    const linkAfter = await fs.lstat(linkPath);
    expect(Math.round(linkAfter.atimeMs / 1_000)).toBe(1_000);
    expect(Math.round(linkAfter.mtimeMs / 1_000)).toBe(3_000);
    const targetAfter = await fs.stat(path.join(tmpDir, "dir"));
    expect(targetAfter.mtimeMs).toBe(targetBefore.mtimeMs);
  });

  test("renameAt and unlinkFileAt act on the symlink itself", async () => {
    await sub.renameAt("loop", sub, "renamed-loop");
    await expect(fs.readlink(path.join(tmpDir, "dir/sub/renamed-loop"))).resolves.toBe("..");

    await sub.unlinkFileAt("renamed-loop");
    await expect(fs.lstat(path.join(tmpDir, "dir/sub/renamed-loop"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.readFile(path.join(tmpDir, "dir/outside.txt"), "utf8")).resolves.toBe(
      "outside",
    );
  });

  test("operations that follow the symlink still reject it", async () => {
    await expect(sub.statAt({ symlinkFollow: true }, "loop")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(sub.metadataHashAt({ symlinkFollow: true }, "loop")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(
      sub.openAt({ symlinkFollow: true }, "loop", { directory: true }, { read: true }),
    ).rejects.toMatchObject({ payload: { tag: "not-permitted" } });
  });

  test("operations without symlink-follow still reject it before the final component", async () => {
    await expect(sub.statAt({ symlinkFollow: false }, "loop/outside.txt")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(sub.readlinkAt("loop/sub/loop")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(sub.unlinkFileAt("loop/outside.txt")).rejects.toMatchObject({
      payload: { tag: "not-permitted" },
    });
    await expect(fs.readFile(path.join(tmpDir, "dir/outside.txt"), "utf8")).resolves.toBe(
      "outside",
    );
  });

  // `chain -> loop -> ..` only leads outside once the second symlink is followed
  test("a symlink that leads outside through another symlink is rejected", async () => {
    const chainPath = path.join(tmpDir, "dir/sub/chain");
    await fs.symlink("loop", chainPath);
    try {
      await expect(
        sub.openAt({ symlinkFollow: true }, "chain/outside.txt", {}, { read: true }),
      ).rejects.toMatchObject({ payload: { tag: "not-permitted" } });
      await expect(sub.statAt({ symlinkFollow: true }, "chain")).rejects.toMatchObject({
        payload: { tag: "not-permitted" },
      });
      await expect(sub.statAt({ symlinkFollow: false }, "chain/outside.txt")).rejects.toMatchObject(
        { payload: { tag: "not-permitted" } },
      );
      await expect(sub.unlinkFileAt("chain/outside.txt")).rejects.toMatchObject({
        payload: { tag: "not-permitted" },
      });
      await expect(fs.readFile(path.join(tmpDir, "dir/outside.txt"), "utf8")).resolves.toBe(
        "outside",
      );
    } finally {
      await fs.rm(chainPath, { force: true });
    }
  });

  test("symlinks that stay inside the directory are followed", async () => {
    await fs.mkdir(path.join(tmpDir, "dir/sub/inner/nested"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "dir/sub/inner/inside.txt"), "inside");
    // `up -> nested/..` leaves `nested` but not the directory, and `via -> up` chains to it
    const upPath = path.join(tmpDir, "dir/sub/inner/up");
    const viaPath = path.join(tmpDir, "dir/sub/via");
    await fs.symlink("nested/..", upPath);
    await fs.symlink("inner/up", viaPath);
    try {
      const stat = await sub.statAt({ symlinkFollow: true }, "via/inside.txt");
      expect(stat.type).toEqual({ tag: "regular-file" });
    } finally {
      await fs.rm(upPath, { force: true });
      await fs.rm(viaPath, { force: true });
    }
  });

  test("a symlink cycle is reported as a loop", async () => {
    const firstPath = path.join(tmpDir, "dir/sub/cycle-a");
    const secondPath = path.join(tmpDir, "dir/sub/cycle-b");
    await fs.symlink("cycle-b", firstPath);
    await fs.symlink("cycle-a", secondPath);
    try {
      await expect(sub.statAt({ symlinkFollow: true }, "cycle-a")).rejects.toMatchObject({
        payload: { tag: "loop" },
      });
    } finally {
      await fs.rm(firstPath, { force: true });
      await fs.rm(secondPath, { force: true });
    }
  });
});
