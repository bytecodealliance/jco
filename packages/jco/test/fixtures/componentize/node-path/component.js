import { join, matchesGlob, resolve, win32 } from "node:path";

/** Path operations that never touch the host */
export function lexical() {
    return [
        join("a", "b", "..", "c"),
        win32.join("C:\\a", "b"),
        win32.sep,
        String(matchesGlob("a/b.js", "a/*.js")),
    ].join("|");
}

/** Resolving a relative path reads the host's cwd through wasi:cli/environment */
export function fromCwd() {
    return resolve("relative");
}
