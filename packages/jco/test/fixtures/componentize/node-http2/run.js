import { spawn } from "node:child_process";
import http2 from "node:http2";
import { argv, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withWasiSockets } from "../helpers/wasi-sockets.js";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

function spawnPeer(...args) {
    return spawn(process.execPath, [fileURLToPath(new URL("./peer.js", import.meta.url)), ...args], {
        stdio: ["ignore", "pipe", "inherit"],
    });
}

function request(authority, path, body) {
    return new Promise((resolve, reject) => {
        const session = http2.connect(authority);
        const stream = session.request({ ":method": "POST", ":path": path });
        const chunks = [];
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.once("error", reject);
        session.once("error", reject);
        stream.once("end", () => {
            session.close();
            resolve(chunks.join(""));
        });
        stream.end(body);
    });
}

// Keep the native server in its own process so it can respond while the guest
// waits on synchronous WASI socket operations.
const localServer = spawnPeer("server");
let componentServer;

try {
    const localPort = await new Promise((resolve, reject) => {
        localServer.once("error", reject);
        localServer.stdout.once("data", (chunk) => resolve(Number(String(chunk).trim())));
    });
    const { instantiate } = await import(pathToFileURL(argv[2]));
    const imports = withWasiSockets(new WASIShim().getImportObject());
    const instance = await instantiate(undefined, imports);
    const local = JSON.parse(await instance.runClient(`http://127.0.0.1:${localPort}`, "/large", ""));

    componentServer = spawn(
        process.execPath,
        [fileURLToPath(new URL("./component-server.js", import.meta.url)), argv[2]],
        { stdio: ["ignore", "pipe", "inherit"] },
    );
    const guestPort = await new Promise((resolve, reject) => {
        componentServer.once("error", reject);
        componentServer.stdout.once("data", (chunk) => resolve(Number(String(chunk).trim())));
    });
    const guestBody = await request(`http://127.0.0.1:${guestPort}`, "/large", "runner");
    const guest = { length: guestBody.length, first: guestBody[0], last: guestBody.at(-1) };
    componentServer.kill();

    let echo;
    if (argv[3] === "echo") {
        echo = JSON.parse(await instance.runClient(`http://127.0.0.1:${localPort}`, "/echo", "echo.test"));
    }
    stdout.write(`${JSON.stringify({ local, guest, echo })}\n`);
} finally {
    componentServer?.kill();
    localServer.kill();
}
