import net from "node:net";
import { spawn } from "node:child_process";
import { argv, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
Object.assign(imports["wasi:sockets/instance-network"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/ip-name-lookup"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/tcp-create-socket"], imports["wasi:sockets/tcp"]);
// The existing StarlingMonkey bindings require these compatibility members.
imports["wasi:sockets/network"].Network.prototype.noop ??= () => {};
imports["wasi:sockets/network"].networkErrorCode ??= () => undefined;
const instance = await instantiate(undefined, imports);
if (argv[3] === "server") {
    const port = await instance.startServer();
    stdout.write(`${port}\n`);
    await instance.serveOne();
    process.exit(0);
}
const surface = JSON.parse(await instance.surface());

function childPort(child) {
    return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`Peer exited before listening: ${code}`)));
        child.stdout.once("data", (chunk) => resolve(Number(String(chunk).trim())));
    });
}

const host = spawn(process.execPath, [fileURLToPath(new URL("./peer.js", import.meta.url))], {
    stdio: ["ignore", "pipe", "inherit"],
});
let guest;
try {
    const client = await instance.runClient(await childPort(host));
    guest = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), argv[2], "server"], {
        stdio: ["ignore", "pipe", "inherit"],
    });
    const guestExit = new Promise((resolve, reject) => {
        guest.once("error", reject);
        guest.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Guest server exited: ${code}`))));
    });
    const port = await childPort(guest);
    const response = new Promise((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1").setEncoding("utf8");
        let body = "";
        socket.on("data", (chunk) => {
            body += chunk;
        });
        socket.once("error", reject);
        socket.once("end", () => resolve(body));
        socket.end("runner");
    });
    const server = await response;
    await guestExit;
    stdout.write(`${JSON.stringify({ surface, client, server })}\n`);
} finally {
    guest?.kill();
    host.kill();
}
