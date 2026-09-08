import { fork } from "node:child_process";
import { once } from "node:events";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { withWasiSockets } from "../helpers/wasi-sockets.js";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

// WASI's blocking stream reads occupy this thread; run the peer independently.
const server = fork(new URL("./peer.js", import.meta.url), { stdio: ["ignore", "ignore", "inherit", "ipc"] });
const [port] = await once(server, "message");

try {
    const { instantiate } = await import(pathToFileURL(argv[2]));
    const imports = withWasiSockets(new WASIShim().getImportObject());
    if (argv[3]) {
        imports[argv[3]] = await import(argv[3]);
    }
    const instance = await instantiate(undefined, imports);
    stdout.write(`${JSON.stringify(await instance.run(`http://127.0.0.1:${port}/`))}\n`);
} finally {
    const exited = once(server, "exit");
    server.kill();
    await exited;
}
