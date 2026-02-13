import os from "node:os";
import path from "node:path";
import process from "node:process";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const { stream } = await import("@bytecodealliance/preview3-shim/stream");

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

    const { stream, future } = child.readViaStream(0n);
    const buf = await stream.readAll();
    const text = new TextDecoder().decode(buf);
    expect(text).toContain("UNIQUE STRING");

    await future.read();
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

    const { stream: sr, future: fr } = child.readViaStream(0n);
    const buf = await sr.readAll();
    await fr.read();

    expect(new TextDecoder().decode(buf)).toBe("Hello Preview3!");

    child[Symbol.dispose]?.();
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

    const { stream: sr, future: fr } = child.readViaStream(0n);
    const buf = await sr.readAll();
    await fr.read();

    expect(new TextDecoder().decode(buf)).toBe("AB");
    child[Symbol.dispose]?.();
  });

  test("createDirectoryAt => readDirectory => removeDirectoryAt", async () => {
    const dirDesc = await rootDescriptor.openAt({}, relBase, { directory: true }, { read: true });

    const readDir = async () => {
      const { stream, future } = dirDesc.readDirectory();
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

  test("isSameObject & metadataHash vs metadataHashAt", async () => {
    const sub = `${relBase}/file3.txt`;
    const child = await rootDescriptor.openAt(
      {},
      sub,
      { create: true },
      { read: true, write: true },
    );

    expect(child.isSameObject(child)).toBe(true);
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

    expect(stats1.type).toBe("regular-file");
    expect(typeof stats1.size).toBe("bigint");
    expect(typeof stats1.dataAccessTimestamp.seconds).toBe("bigint");
    expect(typeof stats1.dataAccessTimestamp.nanoseconds).toBe("number");
    child[Symbol.dispose]?.();

    const realPath = path.join(tmpDir, "statat-file.txt");
    const linkSub = `${relBase}/statat-link.txt`;
    const linkPath = path.join(tmpDir, "statat-link.txt");
    await fs.symlink(realPath, linkPath);

    const stats2 = await rootDescriptor.statAt({ symlinkFollow: false }, linkSub);
    expect(stats2.type).toBe("symbolic-link");

    const stats3 = await rootDescriptor.statAt({ symlinkFollow: true }, linkSub);
    expect(stats3.type).toBe("regular-file");
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
