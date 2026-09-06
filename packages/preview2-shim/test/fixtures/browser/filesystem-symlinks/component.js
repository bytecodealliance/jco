import { getDirectories } from "wasi:filesystem/preopens@0.2.8";

const follow = { symlinkFollow: true };
const dispose = (resource) => resource[Symbol.dispose || Symbol.for("dispose")]();

function check(condition, message) {
    if (!condition) {
        throw message;
    }
}

function expectError(operation, expected) {
    try {
        operation();
    } catch (error) {
        const actual = error.payload ?? error;
        check(actual === expected, `expected ${expected}, received ${actual}`);
        return;
    }
    throw `expected ${expected}, operation succeeded`;
}

function sameHash(left, right) {
    return left.upper === right.upper && left.lower === right.lower;
}

function readText(file) {
    return new TextDecoder().decode(file.read(100n, 0n)[0]);
}

export const test = {
    run() {
        const [[root]] = getDirectories();
        const results = {};
        const run = (name, operation) => {
            try {
                operation();
                results[name] = "ok";
            } catch (error) {
                results[name] = String(error.payload ?? error);
            }
        };

        run("follow and no-follow", () => {
            root.symlinkAt("target", "link");
            check(root.readlinkAt("link") === "target", "readlink changed target");
            check(root.statAt({}, "link").type === "symbolic-link", "lstat followed link");
            check(root.statAt(follow, "link").type === "regular-file", "stat did not follow");
            const file = root.openAt(follow, "link", {}, { read: true });
            check(readText(file) === "value", "wrong target contents");
            dispose(file);
            expectError(() => root.openAt({}, "link", {}, { read: true }), "loop");
        });

        run("intermediate symlink chains", () => {
            root.createDirectoryAt("real");
            root.symlinkAt("real", "alias1");
            root.symlinkAt("alias1", "alias2");
            const file = root.openAt({}, "alias2/file", { create: true }, { write: true });
            file.write(new TextEncoder().encode("nested"), 0n);
            dispose(file);
            root.symlinkAt("file", "real/link");
            check(root.statAt({}, "alias2/link").type === "symbolic-link", "followed final link");
            const opened = root.openAt(follow, "alias2/link", {}, { read: true });
            check(readText(opened) === "nested", "intermediate chain read wrong file");
            dispose(opened);
        });

        run("directory entries and metadata", () => {
            root.symlinkAt("target", "metadata-link");
            const entries = root.readDirectory();
            let found = false;
            for (let entry; (entry = entries.readDirectoryEntry()); ) {
                if (entry.name === "metadata-link") {
                    check(entry.type === "symbolic-link", "wrong readdir type");
                    found = true;
                }
            }
            dispose(entries);
            check(found, "missing directory entry");
            const linkBefore = root.metadataHashAt({}, "metadata-link");
            const fileBefore = root.metadataHashAt({}, "target");
            check(
                sameHash(root.metadataHashAt(follow, "metadata-link"), fileBefore),
                "wrong followed hash",
            );
            root.setTimesAt({}, "metadata-link", { tag: "no-change" }, { tag: "now" });
            const linkAfter = root.metadataHashAt({}, "metadata-link");
            check(!sameHash(linkBefore, linkAfter), "link hash did not change");
            check(
                sameHash(fileBefore, root.metadataHashAt({}, "target")),
                "changed target without follow",
            );
            root.setTimesAt(follow, "metadata-link", { tag: "no-change" }, { tag: "now" });
            check(
                !sameHash(fileBefore, root.metadataHashAt({}, "target")),
                "target hash did not change",
            );
            check(
                sameHash(linkAfter, root.metadataHashAt({}, "metadata-link")),
                "changed link with follow",
            );
        });

        run("hard links and unlink", () => {
            root.symlinkAt("target", "hardlink-source");
            root.linkAt({}, "hardlink-source", root, "linked-symlink");
            root.linkAt(follow, "hardlink-source", root, "linked-file");
            check(root.readlinkAt("linked-symlink") === "target", "did not link symlink");
            const target = root.openAt({}, "target", {}, { read: true });
            const linked = root.openAt({}, "linked-file", {}, { read: true });
            check(target.isSameObject(linked), "hard link has different identity");
            dispose(linked);
            dispose(target);
            root.unlinkFileAt("hardlink-source");
            check(root.statAt({}, "target").type === "regular-file", "unlink removed target");
        });

        run("cyclic links", () => {
            root.symlinkAt("cycle-b", "cycle-a");
            root.symlinkAt("cycle-a", "cycle-b");
            expectError(() => root.statAt(follow, "cycle-a"), "loop");
        });

        run("create dangling target", () => {
            root.symlinkAt("created-target", "dangling");
            const file = root.openAt(follow, "dangling", { create: true }, { write: true });
            file.write(new TextEncoder().encode("created"), 0n);
            dispose(file);
            check(root.statAt({}, "dangling").type === "symbolic-link", "create replaced symlink");
            check(root.readlinkAt("dangling") === "created-target", "create changed link target");
            const target = root.openAt({}, "created-target", {}, { read: true });
            check(readText(target) === "created", "data was not written to target");
            dispose(target);
        });

        run("exclusive create", () => {
            root.symlinkAt("exclusive-target", "exclusive-link");
            expectError(() => {
                const file = root.openAt(
                    follow,
                    "exclusive-link",
                    { create: true, exclusive: true },
                    { write: true },
                );
                dispose(file);
            }, "exist");
            check(
                root.readlinkAt("exclusive-link") === "exclusive-target",
                "exclusive create replaced symlink",
            );
            expectError(() => root.statAt({}, "exclusive-target"), "no-entry");
        });

        run("missing target parent", () => {
            root.symlinkAt("missing/target", "missing-parent-link");
            expectError(() => {
                const file = root.openAt(
                    follow,
                    "missing-parent-link",
                    { create: true },
                    { write: true },
                );
                dispose(file);
            }, "no-entry");
            check(
                root.readlinkAt("missing-parent-link") === "missing/target",
                "failed create replaced link",
            );
        });

        run("relative parent target", () => {
            root.createDirectoryAt("nested");
            root.symlinkAt("../target", "nested/parent-link");
            const file = root.openAt(follow, "nested/parent-link", {}, { read: true });
            check(readText(file) === "value", "relative target read wrong file");
            dispose(file);
            const nested = root.openAt({}, "nested", { directory: true }, { read: true });
            expectError(() => nested.statAt(follow, "parent-link"), "not-permitted");
            dispose(nested);
        });

        run("dot target with configured cwd", () => {
            root.symlinkAt(".", "self");
            check(
                sameHash(root.metadataHashAt(follow, "self"), root.metadataHash()),
                "dot target resolved to cwd",
            );
            root.createDirectoryAt("self/created-dir");
            check(
                root.statAt({}, "created-dir").type === "directory",
                "created directory under cwd",
            );
        });

        run("absolute preset target", () => {
            expectError(() => root.statAt(follow, "absolute"), "not-permitted");
        });

        run("readlink absolute preset target", () => {
            expectError(() => root.readlinkAt("absolute"), "not-permitted");
        });

        run("create through relative target chain", () => {
            root.createDirectoryAt("creation-dir");
            root.symlinkAt("creation-dir", "creation-alias");
            root.symlinkAt("../creation-second", "creation-dir/first");
            root.symlinkAt("creation-target", "creation-second");
            const file = root.openAt(
                follow,
                "creation-alias/first",
                { create: true },
                { write: true },
            );
            file.write(new TextEncoder().encode("created through chain"), 0n);
            dispose(file);
            check(
                root.readlinkAt("creation-dir/first") === "../creation-second",
                "replaced first link",
            );
            check(root.readlinkAt("creation-second") === "creation-target", "replaced second link");
            const target = root.openAt({}, "creation-target", {}, { read: true });
            check(readText(target) === "created through chain", "created at wrong location");
            dispose(target);
        });

        run("parent-relative directory mutations", () => {
            root.createDirectoryAt("mutation-dir");
            root.createDirectoryAt("mutation-target");
            root.symlinkAt("../mutation-target", "mutation-dir/alias");
            root.createDirectoryAt("mutation-dir/alias/child");
            root.symlinkAt("child", "mutation-dir/alias/link");
            root.renameAt("mutation-dir/alias/link", root, "mutation-dir/alias/renamed");
            check(
                root.readlinkAt("mutation-target/renamed") === "child",
                "renamed in wrong directory",
            );
            root.unlinkFileAt("mutation-dir/alias/renamed");
            root.removeDirectoryAt("mutation-dir/alias/child");
            expectError(() => root.statAt({}, "mutation-target/child"), "no-entry");
        });

        dispose(root);
        return JSON.stringify(results);
    },
};
