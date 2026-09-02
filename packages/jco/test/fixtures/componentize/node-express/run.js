import http from "node:http";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const [, , componentPath, httpHostPath, ...capabilities] = argv;

const httpHost = await import(httpHostPath);
const { instantiate } = await import(pathToFileURL(componentPath));

const imports = new WASIShim().getImportObject();
imports[httpHostPath] = httpHost;
for (const capability of capabilities) {
    const separator = capability.indexOf("=");
    imports[capability.slice(0, separator)] = await import(capability.slice(separator + 1));
}

const instance = await instantiate(undefined, imports);

// The host provider is one of the component's imports, so it cannot reach the component's
// exports on its own. Connecting them is what lets the host call back into the application
// for each request.
httpHost.setCallbacks(instance["jco:node/http-callbacks@0.1.0"]);

const port = await instance.start();

function call(path, options = {}, body) {
    return new Promise((resolve, reject) => {
        const request = http.request(`http://127.0.0.1:${port}${path}`, options, (response) => {
            response.setEncoding("utf8");
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.once("end", () =>
                resolve({
                    status: response.statusCode,
                    contentType: response.headers["content-type"] ?? "",
                    etag: response.headers.etag !== undefined,
                    body: chunks.join(""),
                }),
            );
        });
        request.once("error", reject);
        request.end(body);
    });
}

try {
    stdout.write(
        `${JSON.stringify({
            root: await call("/"),
            params: await call("/items/42?page=3"),
            posted: await call(
                "/echo",
                { method: "POST", headers: { "Content-Type": "application/json" } },
                JSON.stringify({ hello: "world" }),
            ),
            missing: await call("/nope"),
        })}\n`,
    );
} finally {
    await instance.stop();
}
