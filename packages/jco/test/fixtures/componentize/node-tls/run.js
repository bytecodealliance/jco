import https from "node:https";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const [modulePath, hostPath, keyPath, certPath] = process.argv.slice(2);
const { createTlsHost } = await import(pathToFileURL(hostPath));
const host = createTlsHost({
    onCallbackError: (error) => {
        console.error(error);
        process.exitCode = 1;
    },
});
const { instantiate } = await import(pathToFileURL(modulePath));
const { createHttpHost } = await import(new URL("../http-host-node.js", pathToFileURL(hostPath)));
let instance;
instance = await instantiate(undefined, {
    ...new WASIShim().getImportObject(),
    "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host": createHttpHost(() => instance.httpCallbacks, host),
    "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/host": await import(
        new URL("../tls-host.js", pathToFileURL(hostPath))
    ),
    "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/node-host": host,
});
host.attachCallbacks(instance.tlsCallbacks);
try {
    await instance.start(await readFile(keyPath, "utf8"), await readFile(certPath, "utf8"));
    const deadline = Date.now() + 15_000;
    let report;
    while (!(report = await instance.status())) {
        if (Date.now() > deadline) {
            throw new Error("TLS fixture timed out");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const key = await readFile(keyPath, "utf8");
    const cert = await readFile(certPath, "utf8");
    const port = await instance.startHttps(key, cert);
    const response = await new Promise((resolve, reject) => {
        https
            .get({ hostname: "127.0.0.1", port, servername: "localhost", ca: [cert], agent: false }, (res) => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    body += chunk;
                });
                res.on("end", () => resolve(body));
                res.on("error", reject);
            })
            .on("error", reject);
    });
    await instance.stopHttps();
    const peer = https.createServer({ key, cert }, (_req, res) => res.end("native HTTPS"));
    await new Promise((resolve) => peer.listen(0, "127.0.0.1", resolve));
    try {
        const client = await instance.fetchHttps(peer.address().port, cert);
        console.log(JSON.stringify({ ...JSON.parse(report), https: { client, server: response } }));
    } finally {
        await new Promise((resolve) => peer.close(resolve));
    }
} finally {
    host.dispose();
}
