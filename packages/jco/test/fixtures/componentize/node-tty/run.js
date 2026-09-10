import nativeProcess from "node:process";
import nodeTty from "node:tty";
import { pathToFileURL } from "node:url";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { createTtyHost } from "./provider.js";

const [modulePath, mode] = nativeProcess.argv.slice(2);
const { instantiate } = await import(pathToFileURL(modulePath));

// The default transpile mapping names jco-std's deny host; instantiation supplies the module
// under that name, so the same component runs against every provider here.
const DENY_SPECIFIER = "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tty/host";
// The sibling workspace build, so the runner needs no published jco-std release.
const std = new URL("../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/", import.meta.url);

function failure(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        return {
            name: error.name,
            code: error.code,
            message: error.message,
            errno: error.errno,
            syscall: error.syscall,
            info: error.info ?? null,
            rangeError: error instanceof RangeError,
        };
    }
}

let host;
let fake;
if (mode === "node") {
    host = await import(new URL("tty-host-node.js", std));
} else if (mode === "denied") {
    host = await import(new URL("tty-host.js", std));
} else {
    fake = createTtyHost({ input: ["Ada\r", "\n"] });
    host = fake.host;
}

const instance = await instantiate(undefined, { ...new WASIShim().getImportObject(), [DENY_SPECIFIER]: host });
const guest = JSON.parse(instance.run(mode));
const result = {
    guest,
    native: {
        isatty: [0, 1, 2, 4096].map((fd) => nodeTty.isatty(fd)),
        notATerminal: failure(() => new nodeTty.WriteStream(4096)),
        init: failure(() => new nodeTty.WriteStream(1)),
        invalidFd: failure(() => new nodeTty.WriteStream(-1)),
    },
    terminal: fake?.state,
};
nativeProcess.stdout.write(`RESULT ${JSON.stringify(result)}\n`);
