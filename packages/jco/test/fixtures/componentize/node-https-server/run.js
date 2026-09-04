import { readFile } from "node:fs/promises";
import https from "node:https";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const tls = new URL("../../../../../preview2-shim/test/fixtures/tls/", import.meta.url);
const cert = await readFile(new URL("localhost.crt", tls), "utf8");
const key = await readFile(new URL("localhost.key", tls), "utf8");

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
imports[argv[3]] = await import(argv[3]);
const instance = await instantiate(undefined, imports);
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
    await instance.stop();
}
