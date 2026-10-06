import { readFile } from "node:fs/promises";
import https from "node:https";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { createTlsHost } from "../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/tls/host-node.js";
import * as deniedWasiTls from "../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/tls-host.js";

const tls = new URL("../../../../../jco-std/test/wasi/0.2.x/node/24.x.x/https/helpers/tls/", import.meta.url);
const cert = await readFile(new URL("localhost.crt", tls), "utf8");
const key = await readFile(new URL("localhost.key", tls), "utf8");

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
const tlsHost = createTlsHost();
imports["jco:node/tls"] = tlsHost;
imports["wasi:tls/types"] = deniedWasiTls;
const host = await import(argv[3]);
let instance;
imports[argv[3]] = host.createHttpHost(() => instance.httpCallbacks, tlsHost);
instance = await instantiate(undefined, imports);
const port = await instance.start(key, cert);

try {
    const body = await new Promise((resolve, reject) => {
        const request = https.request(
            `https://127.0.0.1:${port}/items`,
            { method: "POST", ca: cert, servername: "localhost" },
            (response) => {
                response.setEncoding("utf8");
                const chunks = [];
                response.on("data", (chunk) => chunks.push(chunk));
                response.once("end", () => resolve(chunks.join("")));
            },
        );
        request.once("error", reject);
        request.end("hello");
    });
    stdout.write(`${body}\n`);
} finally {
    try {
        await instance.stop();
    } finally {
        tlsHost.dispose();
    }
}
