import { getDirectories } from "wasi:filesystem/preopens@0.2.8";

const dispose = (resource) => resource[Symbol.dispose || Symbol.for("dispose")]();

function check(condition, message) {
    if (!condition) {
        throw message;
    }
}

function readText(file) {
    return new TextDecoder().decode(file.read(200n, 0n)[0]);
}

function exists(root, path) {
    try {
        root.statAt({}, path);
        return true;
    } catch {
        return false;
    }
}

// Called twice by the host, against the same OPFS directory: once against a live
// `OpfsFilesystemAdapter` to create content, and once more after a flush + reload into a
// fresh adapter, to confirm the writes and symlink actually persisted to OPFS storage
// rather than just living in that first adapter's in-memory tree.
export const test = {
    run() {
        const [[root]] = getDirectories();

        if (!exists(root, "marker.txt")) {
            root.createDirectoryAt("notes");
            const file = root.openAt({}, "notes/todo.txt", { create: true }, { write: true });
            file.write(new TextEncoder().encode("buy milk"), 0n);
            dispose(file);

            root.symlinkAt("notes/todo.txt", "todo-link.txt");

            const marker = root.openAt({}, "marker.txt", { create: true }, { write: true });
            marker.write(new TextEncoder().encode("written"), 0n);
            dispose(marker);

            dispose(root);
            return "write:ok";
        }

        try {
            check(
                root.readlinkAt("todo-link.txt") === "notes/todo.txt",
                "symlink target did not survive reload",
            );
            const linked = root.openAt(
                { symlinkFollow: true },
                "todo-link.txt",
                {},
                { read: true },
            );
            check(readText(linked) === "buy milk", "file contents did not survive reload");
            dispose(linked);
            dispose(root);
            return "read:ok";
        } catch (error) {
            dispose(root);
            throw error.payload ?? error;
        }
    },
};
