import { assert, test } from "vitest";
import { InMemoryFilesystemAdapter, type FileData } from "../../src/browser/filesystem.js";
import { _getCwd, _setCwd } from "../../src/browser/config.js";

function root(data: FileData) {
    return new InMemoryFilesystemAdapter().getRoot(data);
}

test.concurrent("create through dangling symlink preserves link and creates target", () => {
    const dir = root({ dir: {} });
    dir.symlinkAt("target", "link");
    const file = dir.openAt({ symlinkFollow: true }, "link", { create: true }, { write: true });
    file.write(new TextEncoder().encode("created"), 0n);
    assert.strictEqual(dir.statAt({}, "link").type, "symbolic-link");
    assert.strictEqual(dir.readlinkAt("link"), "target");
    assert.strictEqual(dir.statAt({}, "target").type, "regular-file");
    const target = dir.openAt({}, "target", {}, { read: true });
    assert.strictEqual(new TextDecoder().decode(target.read(100n, 0n)[0]), "created");
});

test.concurrent("exclusive create rejects dangling link without changing entries", () => {
    const dir = root({ dir: {} });
    dir.symlinkAt("target", "link");
    assert.throws(
        () =>
            dir.openAt(
                { symlinkFollow: true },
                "link",
                { create: true, exclusive: true },
                { write: true },
            ),
        "exist",
    );
    assert.strictEqual(dir.readlinkAt("link"), "target");
    assert.throws(() => dir.statAt({}, "target"), "no-entry");
});

test.concurrent("relative target can traverse parent within base directory", () => {
    const dir = root({ dir: { target: { source: "value" }, nested: { dir: {} } } });
    dir.symlinkAt("../target", "nested/link");
    assert.strictEqual(dir.statAt({ symlinkFollow: true }, "nested/link").type, "regular-file");
    const nested = dir.openAt({}, "nested", { directory: true }, { read: true });
    assert.throws(() => nested.statAt({ symlinkFollow: true }, "link"), "not-permitted");
});

test.concurrent("symlink to dot resolves to its containing directory with non-root cwd", () => {
    const dir = root({ dir: { work: { dir: {} } } });
    const previousCwd = _getCwd();
    // Keep this callback synchronous so the global CWD change cannot interleave
    // with another concurrent test, and always restore the previous value.
    _setCwd("/work");
    try {
        dir.symlinkAt(".", "self");
        assert.deepStrictEqual(
            dir.metadataHashAt({ symlinkFollow: true }, "self"),
            dir.metadataHash(),
        );
        dir.createDirectoryAt("self/created");
        assert.strictEqual(dir.statAt({}, "created").type, "directory");
    } finally {
        _setCwd(previousCwd);
    }
});

test.concurrent("preset absolute symlink cannot be followed", () => {
    const dir = root({ dir: { file: { source: "value" }, link: { symlink: "/file" } } });
    assert.throws(() => dir.statAt({ symlinkFollow: true }, "link"), "not-permitted");
});

test.concurrent("readlink rejects preset absolute symlink targets", () => {
    const dir = root({ dir: { link: { symlink: "/file" } } });
    assert.throws(() => dir.readlinkAt("link"), "not-permitted");
});

test.concurrent("symlink whose target is missing intermediate directory is not replaced", () => {
    const dir = root({ dir: {} });
    dir.symlinkAt("missing/target", "link");
    assert.throws(
        () => dir.openAt({ symlinkFollow: true }, "link", { create: true }, { write: true }),
        "no-entry",
    );
    assert.strictEqual(dir.readlinkAt("link"), "missing/target");
});

test.concurrent("creation follows a relative target chain through an intermediate alias", () => {
    const dir = root({ dir: { nested: { dir: {} } } });
    dir.symlinkAt("nested", "alias");
    dir.symlinkAt("../second", "nested/first");
    dir.symlinkAt("target", "second");
    const file = dir.openAt(
        { symlinkFollow: true },
        "alias/first",
        { create: true },
        { write: true },
    );
    file.write(new TextEncoder().encode("created"), 0n);
    assert.strictEqual(dir.readlinkAt("nested/first"), "../second");
    assert.strictEqual(dir.readlinkAt("second"), "target");
    assert.deepStrictEqual(dir.metadataHashAt({}, "target"), file.metadataHash());
    assert.throws(() => dir.statAt({}, "nested/target"), "no-entry");
});

test.concurrent("parent-relative directory links support mutations within the base", () => {
    const dir = root({ dir: { nested: { dir: {} }, destination: { dir: {} } } });
    dir.symlinkAt("../destination", "nested/alias");
    dir.createDirectoryAt("nested/alias/child");
    dir.symlinkAt("child", "nested/alias/link");
    assert.strictEqual(dir.statAt({ symlinkFollow: true }, "destination/link").type, "directory");
    dir.renameAt("nested/alias/link", dir, "nested/alias/renamed");
    assert.strictEqual(dir.readlinkAt("destination/renamed"), "child");
    dir.unlinkFileAt("nested/alias/renamed");
    dir.removeDirectoryAt("nested/alias/child");
    assert.throws(() => dir.statAt({}, "destination/child"), "no-entry");
});

test.concurrent("cyclic target creation leaves the links intact", () => {
    const dir = root({ dir: { a: { symlink: "b" }, b: { symlink: "a" } } });
    const before = dir.metadataHash();
    assert.throws(
        () => dir.openAt({ symlinkFollow: true }, "a", { create: true }, { write: true }),
        "loop",
    );
    assert.strictEqual(dir.readlinkAt("a"), "b");
    assert.strictEqual(dir.readlinkAt("b"), "a");
    assert.deepStrictEqual(dir.metadataHash(), before);
});

test.concurrent("mutations enforce a symlink budget across all path segments", () => {
    const dir = root({ dir: { self: { symlink: "." } } });
    const allowed = "self/".repeat(40);
    const excessive = "self/".repeat(41);
    dir.createDirectoryAt(allowed + "created");
    assert.strictEqual(dir.statAt({}, "created").type, "directory");
    assert.throws(() => dir.symlinkAt("created", excessive + "link"), "loop");
    assert.throws(() => dir.statAt({}, "link"), "no-entry");
});
