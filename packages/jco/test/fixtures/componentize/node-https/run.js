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

const server = https.createServer({ key, cert }, (_request, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.end("hello from node:https");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const tlsHost = createTlsHost();

try {
    const address = server.address();
    const { instantiate } = await import(pathToFileURL(argv[2]));
    const imports = new WASIShim().getImportObject();
    imports["jco:node/tls"] = tlsHost;
    imports["wasi:tls/types"] = deniedWasiTls;
    const { createHttpHost } = await import(argv[3]);
    imports[argv[3]] = createHttpHost(undefined, tlsHost);
    const instance = await instantiate(undefined, imports);
    stdout.write(`${JSON.stringify(await instance.run(`https://127.0.0.1:${address.port}/`, cert))}\n`);
} finally {
    tlsHost.dispose();
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
