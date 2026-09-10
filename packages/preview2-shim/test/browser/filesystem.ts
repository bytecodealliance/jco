import { suite, test, assert } from "vitest";

suite("Browser filesystem", () => {
    test("writeViaStream reuses file capacity", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        const file = { source: new Uint8Array([1, 2, 3]) };
        _setFileData({ dir: { file } });

        const [[rootDescriptor]] = preopens.getDirectories();
        const descriptor = rootDescriptor.openAt({}, "file", {}, { write: true });
        const stream = descriptor.writeViaStream(3n);

        stream.checkWrite();
        stream.write(new Uint8Array([4, 5]));
        const buffer = file.source.buffer;
        stream.checkWrite();
        stream.write(new Uint8Array([6]));

        assert.strictEqual(file.source.buffer, buffer);
        assert.deepStrictEqual(file.source, new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    test("writeViaStream preserves overwrite and sparse-write semantics", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        const file = { source: new Uint8Array([1, 2, 3, 4]) };
        _setFileData({ dir: { file } });

        const [[rootDescriptor]] = preopens.getDirectories();
        const descriptor = rootDescriptor.openAt({}, "file", {}, { write: true });

        const overwrite = descriptor.writeViaStream(1n);
        overwrite.checkWrite();
        overwrite.write(new Uint8Array([8, 9]));
        assert.deepStrictEqual(file.source, new Uint8Array([1, 8, 9, 4]));

        const sparse = descriptor.writeViaStream(6n);
        sparse.checkWrite();
        sparse.write(new Uint8Array([7]));
        assert.deepStrictEqual(file.source, new Uint8Array([1, 8, 9, 4, 0, 0, 7]));
    });

    test("supports append, resize, rename, and removal", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        const file = { source: new Uint8Array([1, 2]) };
        _setFileData({ dir: { file, empty: { dir: {} } } });

        const [[root]] = preopens.getDirectories();
        const descriptor = root.openAt({}, "file", {}, { read: true, write: true });
        const append = descriptor.appendViaStream();
        append.checkWrite();
        append.write(new Uint8Array([3]));
        assert.deepStrictEqual(file.source, new Uint8Array([1, 2, 3]));

        descriptor.setSize(5n);
        assert.deepStrictEqual(file.source, new Uint8Array([1, 2, 3, 0, 0]));
        root.renameAt("file", root, "renamed");
        assert.strictEqual(root.statAt({}, "renamed").size, 5n);
        root.unlinkFileAt("renamed");
        assert.throws(() => root.statAt({}, "renamed"));
        root.removeDirectoryAt("empty");
        assert.throws(() => root.statAt({}, "empty"));
    });

    test("advise accepts hints on files and rejects directories", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        _setFileData({ dir: { file: { source: new Uint8Array([1, 2, 3]) }, sub: { dir: {} } } });

        const [[root]] = preopens.getDirectories();
        const file = root.openAt({}, "file", {}, { read: true, write: true });
        assert.doesNotThrow(() => file.advise(0n, 3n, "sequential"));

        const dir = root.openAt({}, "sub", {}, { read: true });
        assert.throws(() => dir.advise(0n, 0n, "normal"), "bad-descriptor");
    });

    test("creates only the final path component", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        const fileData = { dir: { parent: { dir: {} }, existing: { dir: {} } } };
        _setFileData(fileData);
        const [[root]] = preopens.getDirectories();

        let error: unknown;
        try {
            root.openAt({}, "missing/file", { create: true }, { write: true });
        } catch (caught) {
            error = caught;
        }
        assert.strictEqual(error, "no-entry");
        assert.strictEqual((fileData.dir as Record<string, unknown>).missing, undefined);

        const created = root.openAt({}, "parent/file", { create: true }, { write: true });
        assert.strictEqual(created.getType(), "regular-file");
        root.createDirectoryAt("parent/child");
        assert.strictEqual(root.statAt({}, "parent/child").type, "directory");
        error = undefined;
        try {
            root.createDirectoryAt("existing");
        } catch (caught) {
            error = caught;
        }
        assert.strictEqual(error, "exist");
    });

    test("renames entries without deleting or corrupting the tree", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        _setFileData({
            dir: {
                file: { source: "source" },
                target: { source: "target" },
                directory: { dir: { child: { source: "child" } } },
                empty: { dir: {} },
                nonempty: { dir: { value: { source: "value" } } },
            },
        });
        const [[root]] = preopens.getDirectories();
        const thrownValue = (fn: () => void) => {
            try {
                fn();
            } catch (error) {
                return error;
            }
            assert.fail("operation should have thrown");
        };

        root.renameAt("file", root, "file");
        assert.strictEqual(root.statAt({}, "file").type, "regular-file");

        root.renameAt("file", root, "target");
        assert.strictEqual(root.statAt({}, "target").size, 6n);
        assert.strictEqual(
            thrownValue(() => root.statAt({}, "file")),
            "no-entry",
        );

        assert.strictEqual(
            thrownValue(() => root.renameAt("target", root, "empty")),
            "is-directory",
        );
        assert.strictEqual(
            thrownValue(() => root.renameAt("directory", root, "target")),
            "not-directory",
        );
        assert.strictEqual(
            thrownValue(() => root.renameAt("directory", root, "nonempty")),
            "not-empty",
        );

        const directory = root.openAt({}, "directory", { directory: true }, {});
        assert.strictEqual(
            thrownValue(() => root.renameAt("directory", directory, "descendant")),
            "invalid",
        );
        assert.strictEqual(root.statAt({}, "directory/child").type, "regular-file");

        root.renameAt("directory", root, "empty");
        assert.strictEqual(root.statAt({}, "empty/child").type, "regular-file");
    });

    test("shares identity and metadata across descriptors and hard links", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        _setFileData({ dir: { file: { source: "value" } } });
        const [[root]] = preopens.getDirectories();
        const first = root.openAt({}, "file", {}, { read: true, write: true });
        const second = root.openAt({}, "file", {}, { read: true, write: true });

        assert.strictEqual(first.isSameObject(second), true);
        assert.deepStrictEqual(root.metadataHashAt({}, "file"), first.metadataHash());
        const before = first.metadataHash();
        second.write(new Uint8Array([1]), 0n);
        assert.notDeepEqual(first.metadataHash(), before);
        assert.deepStrictEqual(first.metadataHash(), second.metadataHash());

        root.linkAt({}, "file", root, "link");
        const link = root.openAt({}, "link", {}, { read: true });
        assert.strictEqual(first.isSameObject(link), true);
        assert.strictEqual(first.stat().linkCount, 2n);
        assert.strictEqual(link.stat().linkCount, 2n);
        root.unlinkFileAt("file");
        assert.strictEqual(link.stat().linkCount, 1n);
        assert.deepStrictEqual(root.metadataHashAt({}, "link"), link.metadataHash());
    });

    test("symlinkAt and readlinkAt create and report symlinks", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        _setFileData({ dir: { file: { source: "value" }, sub: { dir: {} } } });
        const [[root]] = preopens.getDirectories();

        root.symlinkAt("file", "link");
        assert.strictEqual(root.readlinkAt("link"), "file");
        assert.strictEqual(root.statAt({}, "link").type, "symbolic-link");
        assert.strictEqual(root.statAt({ symlinkFollow: true }, "link").type, "regular-file");

        assert.throws(() => root.symlinkAt("/absolute", "abs-link"), "not-permitted");
        assert.throws(() => root.symlinkAt("file", "link"), "exist");
        assert.throws(() => root.readlinkAt("file"), "invalid");
    });

    test("openAt follows symlinks only when symlink-follow is set", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        _setFileData({ dir: { file: { source: "value" } } });
        const [[root]] = preopens.getDirectories();
        root.symlinkAt("file", "link");

        const followed = root.openAt({ symlinkFollow: true }, "link", {}, { read: true });
        assert.strictEqual(followed.getType(), "regular-file");

        assert.throws(() => root.openAt({}, "link", {}, { read: true }), "loop");
    });

    test("symlinks resolve through intermediate directory components", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        _setFileData({
            dir: {
                real: { dir: { file: { source: "nested" } } },
                alias: { symlink: "real" },
            },
        });
        const [[root]] = preopens.getDirectories();

        assert.strictEqual(root.statAt({}, "alias/file").type, "regular-file");
        assert.strictEqual(root.statAt({}, "alias/file").size, 6n);
        root.createDirectoryAt("alias/child");
        assert.strictEqual(root.statAt({}, "real/child").type, "directory");
    });

    test("cyclic symlinks raise loop instead of recursing forever", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        _setFileData({ dir: { a: { symlink: "b" }, b: { symlink: "a" } } });
        const [[root]] = preopens.getDirectories();

        assert.throws(() => root.statAt({ symlinkFollow: true }, "a"), "loop");
    });

    test("linkAt honors symlink-follow for the old path", async () => {
        const { _setFileData, preopens } = await import("../../src/browser/filesystem.js");
        const fileData = { dir: { file: { source: "value" } } };
        _setFileData(fileData);
        const [[root]] = preopens.getDirectories();
        root.symlinkAt("file", "link");

        root.linkAt({}, "link", root, "unfollowed");
        assert.strictEqual(root.statAt({}, "unfollowed").type, "symbolic-link");

        root.linkAt({ symlinkFollow: true }, "link", root, "followed");
        assert.strictEqual(root.statAt({}, "followed").type, "regular-file");
    });

    test("createFilesystem isolates explicitly selected in-memory roots", async () => {
        const { createFilesystem, InMemoryFilesystemAdapter } =
            await import("../../src/browser/filesystem.js");
        const first = createFilesystem({
            adapter: new InMemoryFilesystemAdapter(),
            preopens: { "/first": { dir: { value: { source: "one" } } } },
        });
        const second = createFilesystem({
            adapter: new InMemoryFilesystemAdapter(),
            preopens: { "/second": { dir: { value: { source: "two" } } } },
        });

        assert.strictEqual(first.preopens.getDirectories()[0][1], "/first");
        assert.strictEqual(second.preopens.getDirectories()[0][1], "/second");
        first.dispose();
        assert.throws(() => first.preopens.getDirectories(), /disposed/);
        assert.strictEqual(second.preopens.getDirectories().length, 1);
    });

    test("createFilesystem delegates descriptor operations to the adapter", async () => {
        const { createFilesystem, InMemoryFilesystemAdapter } =
            await import("../../src/browser/filesystem.js");
        const backing = new InMemoryFilesystemAdapter();
        const calls: string[] = [];
        const wrap = (descriptor: any): any =>
            new Proxy(descriptor, {
                get(target, property) {
                    const value = Reflect.get(target, property, target);
                    if (typeof value !== "function") {
                        return value;
                    }
                    return (...args: any[]) => {
                        calls.push(String(property));
                        const result = Reflect.apply(value, target, args);
                        return property === "openAt" ? wrap(result) : result;
                    };
                },
            });
        const filesystem = createFilesystem({
            adapter: {
                getRoot: (root: any) => wrap(backing.getRoot(root)),
            },
            preopens: { "/": { dir: { file: { source: "value" } } } },
        });

        const [[root]] = filesystem.preopens.getDirectories();
        const file = root.openAt({}, "file", {}, { read: true, write: true });
        file.advise(0n, 5n, "sequential");
        file.syncData();
        file.sync();

        assert.deepStrictEqual(calls, ["openAt", "advise", "syncData", "sync"]);
    });

    test.concurrent("advisory locking: shared locks stack, exclusive locks are exclusive", async () => {
        const { createFilesystem, InMemoryFilesystemAdapter } =
            await import("../../src/browser/filesystem.js");
        const filesystem = createFilesystem({
            adapter: new InMemoryFilesystemAdapter(),
            preopens: { "/": { dir: { file: { source: new Uint8Array([1, 2, 3]) } } } },
        });
        const [[root]] = filesystem.preopens.getDirectories();
        const a = root.openAt({}, "file", {}, { read: true }) as any;
        const b = root.openAt({}, "file", {}, { read: true }) as any;

        assert.strictEqual(a.tryLockShared(), true);
        assert.strictEqual(b.tryLockShared(), true);
        assert.strictEqual(a.tryLockExclusive(), false);

        b.unlock();
        assert.strictEqual(a.tryLockExclusive(), true);
        assert.strictEqual(b.tryLockShared(), false);

        a.unlock();
        assert.strictEqual(b.tryLockShared(), true);
    });

    test.concurrent("advisory locking: lockShared/lockExclusive throw would-block instead of waiting", async () => {
        const { createFilesystem, InMemoryFilesystemAdapter } =
            await import("../../src/browser/filesystem.js");
        const filesystem = createFilesystem({
            adapter: new InMemoryFilesystemAdapter(),
            preopens: { "/": { dir: { file: { source: new Uint8Array([1, 2, 3]) } } } },
        });
        const [[root]] = filesystem.preopens.getDirectories();
        const a = root.openAt({}, "file", {}, { read: true }) as any;
        const b = root.openAt({}, "file", {}, { read: true }) as any;

        a.lockExclusive();
        assert.throws(() => b.lockShared(), "would-block");
        assert.throws(() => b.lockExclusive(), "would-block");
        a.unlock();
        assert.doesNotThrow(() => b.lockExclusive());
    });
});
