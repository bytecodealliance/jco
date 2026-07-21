// This example is the home for Jco's Node.js platform compatibility. As more
// builtins are implemented, their direct `node:*` imports can be demonstrated
// here. node:path is the first supported API.
import path, { basename, join, normalize } from "node:path";
import posix from "node:path/posix";
import win32 from "node:path/win32";

export const run = {
    run() {
        const results = {
            named: basename("/workspace/src/component.js"),
            default: join("src", "components", "..", "component.js"),
            normalize: normalize("/workspace//src/../component.js"),
            posix: posix.relative("/workspace/src", "/workspace/test"),
            namespace: path.posix.join("a", "b"),
            win32: path.win32.join("C:\\workspace", "src", "component.js"),
            subpath: win32.basename("C:\\workspace\\component.js"),
            identities: path === path.posix && posix === path.posix && win32 === path.win32,
        };

        const expected = {
            named: "component.js",
            default: "src/component.js",
            normalize: "/workspace/component.js",
            posix: "../test",
            namespace: "a/b",
            win32: "C:\\workspace\\src\\component.js",
            subpath: "component.js",
            identities: true,
        };

        if (JSON.stringify(results) !== JSON.stringify(expected)) {
            throw new Error(`unexpected node:path results: ${JSON.stringify(results)}`);
        }
        console.log(JSON.stringify(results));
    },
};
