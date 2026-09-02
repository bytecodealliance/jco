import http from "node:http";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
imports[argv[3]] = await import(argv[3]);
const instance = await instantiate(undefined, imports);
const port = await instance.start();

try {
    const body = await new Promise((resolve, reject) => {
        const request = http.request(`http://127.0.0.1:${port}/items`, { method: "POST" }, (response) => {
            response.setEncoding("utf8");
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.once("end", () => resolve(chunks.join("")));
        });
        request.once("error", reject);
        request.end("hello");
    });
    stdout.write(`${body}\n`);
} finally {
    await instance.stop();
}
