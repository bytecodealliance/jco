import http from "node:http";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const [, , componentPath, httpHostPath, ...capabilities] = argv;

let instance;
if (httpHostPath === "native") {
    instance = await import(pathToFileURL(componentPath));
} else {
    const httpHost = await import(httpHostPath);
    const { instantiate } = await import(pathToFileURL(componentPath));

    const imports = new WASIShim().getImportObject();
    // The same StarlingMonkey resource aliases used by the node:net integration runner.
    Object.assign(imports["wasi:sockets/instance-network"], imports["wasi:sockets/network"]);
    Object.assign(imports["wasi:sockets/ip-name-lookup"], imports["wasi:sockets/network"]);
    Object.assign(imports["wasi:sockets/tcp-create-socket"], imports["wasi:sockets/tcp"]);
    imports["wasi:sockets/network"].Network.prototype.noop ??= () => {};
    imports["wasi:sockets/network"].networkErrorCode ??= () => undefined;
    imports[httpHostPath] = httpHost.createHttpHost(() => instance.httpCallbacks);
    for (const capability of capabilities) {
        const separator = capability.indexOf("=");
        imports[capability.slice(0, separator)] = await import(capability.slice(separator + 1));
    }

    instance = await instantiate(undefined, imports);
}

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
                    etag: response.headers.etag ?? "",
                    body: chunks.join(""),
                }),
            );
        });
        request.once("error", reject);
        request.end(body);
    });
}

try {
    const root = await call("/");
    const [params, posted, missing, malformed, failure, cached] = await Promise.all([
        call("/items/42?page=3"),
        call(
            "/echo",
            { method: "POST", headers: { "Content-Type": "application/json" } },
            JSON.stringify({ hello: "world" }),
        ),
        call("/nope"),
        call("/echo", { method: "POST", headers: { "Content-Type": "application/json" } }, "{"),
        call("/error"),
        call("/", { headers: { "If-None-Match": root.etag } }),
    ]);
    stdout.write(`${JSON.stringify({ root, params, posted, missing, malformed, failure, cached })}\n`);
} finally {
    await instance.stop();
}
