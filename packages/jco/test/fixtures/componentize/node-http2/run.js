import { spawn } from "node:child_process";
import { resolve4 } from "node:dns/promises";
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

const localServer = spawnPeer("server");
const localPort = await new Promise((resolve, reject) => {
    localServer.once("error", reject);
    localServer.stdout.once("data", (chunk) => resolve(Number(String(chunk).trim())));
});

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = withWasiSockets(new WASIShim().getImportObject());
const instance = await instantiate(undefined, imports);
let componentServer;

try {
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

    let external;
    if (argv[3] === "external") {
        const [externalAddress] = await resolve4("nghttp2.org");
        external = JSON.parse(await instance.runClient(`http://${externalAddress}`, "/httpbin/post", "nghttp2.org"));
    }
    stdout.write(`${JSON.stringify({ local, guest, external })}\n`);
} finally {
    componentServer?.kill();
    localServer.kill();
}
