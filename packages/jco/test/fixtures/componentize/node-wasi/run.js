import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nativeProcess from "node:process";
import { pathToFileURL } from "node:url";
import { WASI as NodeWASI } from "node:wasi";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const [modulePath, mode] = nativeProcess.argv.slice(2);
const { instantiate } = await import(pathToFileURL(modulePath));

// The default transpile mapping names jco-std's deny host; instantiation supplies the module
// under that name, so the same component runs against every provider here.
const DENY_SPECIFIER = "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/wasi/host";
// The sibling workspace build, so the runner needs no published jco-std release.
const std = new URL("../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/", import.meta.url);

function failure(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        if (typeof error !== "object" || error === null) {
            return { thrown: typeof error };
        }
        return {
            name: error.name,
            code: error.code,
            message: error.message,
            errno: error.errno,
            syscall: error.syscall,
            keys: Object.keys(error),
            typeError: error instanceof TypeError,
            rangeError: error instanceof RangeError,
        };
    }
}

const host = await import(new URL(mode === "node" ? "wasi-host-node.js" : "wasi-host.js", std));
const sandbox = mkdtempSync(join(tmpdir(), "jco-node-wasi-"));
writeFileSync(join(sandbox, "file"), "");

const instance = await instantiate(undefined, { ...new WASIShim().getImportObject(), [DENY_SPECIFIER]: host });
const guest = JSON.parse(instance.run(mode, sandbox));
const native = {
    badVersion: failure(() => new NodeWASI({ version: "preview2" })),
    badStdin: failure(() => new NodeWASI({ version: "preview1", stdin: -1 })),
    missingPreopen: failure(() => new NodeWASI({ version: "preview1", preopens: { "/x": `${sandbox}/missing` } })),
    filePreopen: failure(() => new NodeWASI({ version: "preview1", preopens: { "/x": `${sandbox}/file` } })),
    badFd: failure(() => new NodeWASI({ version: "preview1", stdin: 12345 })),
    lateReturnOnExit: failure(
        () => new NodeWASI({ version: "preview1", returnOnExit: 1, preopens: { "/x": `${sandbox}/missing` } }),
    ),
    notStarted: failure(() => new NodeWASI({ version: "preview1" }).wasiImport.fd_write(1, 0, 0, 0)),
    einval: new NodeWASI({ version: "preview1" }).wasiImport.fd_write(1),
    startShape: failure(() => new NodeWASI({ version: "preview1" }).start({})),
    start: failure(() => new NodeWASI({ version: "preview1" }).start({ exports: {} })),
};
nativeProcess.stdout.write(`RESULT ${JSON.stringify({ guest, native })}\n`);
