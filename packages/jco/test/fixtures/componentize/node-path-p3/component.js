import path, { posix, win32 } from "node:path";
import posixPath from "node:path/posix";
import win32Path from "node:path/win32";
import barePath from "path";
import * as shared from "../node-path/component.js";

// QuickJS requires Promise-returning JS exports for WIT async functions. Node's path calls
// remain synchronous; only the component boundary is async.
export async function lexical() {
    return shared.lexical();
}

export async function fromCwd() {
    return shared.fromCwd();
}

export async function match(path, pattern, windows) {
    return shared.match(path, pattern, windows);
}

export async function identities() {
    return (
        path === posix &&
        path === barePath &&
        path.posix === posixPath &&
        path.win32 === win32Path &&
        win32.posix === posix &&
        posix.win32 === win32 &&
        path._makeLong === path.toNamespacedPath
    );
}

export async function fromDrive() {
    return win32.resolve("C:relative");
}

export async function missingCwd() {
    try {
        path.resolve("relative");
    } catch (error) {
        return error.message;
    }
    return "unexpected success";
}
