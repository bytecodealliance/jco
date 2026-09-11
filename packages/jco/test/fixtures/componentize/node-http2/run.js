import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import http2 from "node:http2";
import { argv, execArgv, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withWasiSockets } from "../helpers/wasi-sockets.js";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

function spawnPeer(...args) {
    return spawn(process.execPath, [fileURLToPath(new URL("./peer.js", import.meta.url)), ...args], {
        stdio: ["ignore", "pipe", "inherit"],
    });
}

function waitForPort(child) {
    return new Promise((resolve, reject) => {
        let output = "";
        const cleanup = () => {
            child.off("error", onError);
            child.off("exit", onExit);
            child.stdout.off("data", onData);
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const onExit = (code, signal) => {
            onError(new Error(`HTTP/2 server exited before announcing its port (${signal ?? code})`));
        };
        const onData = (chunk) => {
            output += chunk;
            if (!output.includes("\n")) {
                return;
            }
            const port = Number(output.slice(0, output.indexOf("\n")));
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                onError(new Error(`Invalid HTTP/2 server port: ${output}`));
                return;
            }
            cleanup();
            resolve(port);
        };
        child.once("error", onError);
        child.once("exit", onExit);
        child.stdout.on("data", onData);
    });
}

function request(authority, path, body) {
    return new Promise((resolve, reject) => {
        const session = http2.connect(authority);
        const stream = session.request({ ":method": "POST", ":path": path });
        const chunks = [];
        let trailers;

        stream.once("trailers", (value) => {
            trailers = value;
        });
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.once("error", reject);
        session.once("error", reject);
        stream.once("end", () => {
            session.close();
            assert.equal(trailers["x-component-trailer"], "complete");
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
    const localPort = await waitForPort(localServer);
    const { instantiate } = await import(pathToFileURL(argv[2]));
    const imports = withWasiSockets(new WASIShim().getImportObject());
    const instance = await instantiate(undefined, imports);
    const local = JSON.parse(await instance.runClient(`http://127.0.0.1:${localPort}`, "/large", ""));

    componentServer = spawn(
        process.execPath,
        // Older supported hosts need --experimental-wasm-jspi in every process
        // that instantiates the component, including this nested server.
        [...execArgv, fileURLToPath(new URL("./component-server.js", import.meta.url)), argv[2]],
        { stdio: ["ignore", "pipe", "inherit"] },
    );
    const guestPort = await waitForPort(componentServer);
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
