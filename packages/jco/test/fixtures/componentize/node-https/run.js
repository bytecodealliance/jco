import { readFile } from "node:fs/promises";
import https from "node:https";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const tls = new URL("../../../../../preview2-shim/test/fixtures/tls/", import.meta.url);
const cert = await readFile(new URL("localhost.crt", tls), "utf8");
const key = await readFile(new URL("localhost.key", tls), "utf8");

const server = https.createServer({ key, cert }, (_request, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.end("hello from node:https");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
    const address = server.address();
    const { instantiate } = await import(pathToFileURL(argv[2]));
    const imports = new WASIShim().getImportObject();
    imports[argv[3]] = await import(argv[3]);
    const instance = await instantiate(undefined, imports);
    stdout.write(`${JSON.stringify(await instance.run(`https://127.0.0.1:${address.port}/`, cert))}\n`);
} finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
