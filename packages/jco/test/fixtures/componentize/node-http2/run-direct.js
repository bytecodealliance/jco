import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http2 from "node:http2";
import { connect } from "node:net";
import { connect as connectTls } from "node:tls";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

process.on("uncaughtException", (error) => {
    console.error(error.stack);
    process.exit(1);
});
const timeout = setTimeout(() => {
    throw new Error("HTTP/2 callback integration timed out");
}, 30_000);
const { instantiate } = await import(pathToFileURL(argv[2]));
const { createHttp2Host } = await import(argv[3]);

async function createInstance() {
    const imports = new WASIShim().getImportObject();
    let instance;
    const taken = [];
    const disposed = [];
    const errorHandled = Promise.withResolvers();
    imports[argv[3]] = createHttp2Host(() => ({
        async takeStreamListener(id) {
            taken.push(id);
            const resource = await instance.http2Callbacks.takeStreamListener(id);
            assert.equal(await instance.http2Callbacks.takeStreamListener(id), undefined);
            return {
                handle: (stream) => resource.handle(stream),
                [Symbol.dispose]() {
                    disposed.push(id);
                    return resource[Symbol.dispose]();
                },
            };
        },
        async takeServerErrorListener(id) {
            const resource = await instance.http2Callbacks.takeServerErrorListener(id);
            assert.equal(await instance.http2Callbacks.takeServerErrorListener(id), undefined);
            assert.equal(id, 2);
            return {
                async handle(reason) {
                    await resource.handle(reason);
                    errorHandled.resolve(reason);
                },
                [Symbol.dispose]() {
                    disposed.push(id);
                    return resource[Symbol.dispose]();
                },
            };
        },
    }));
    instance = await instantiate(undefined, imports);
    return { instance, taken, disposed, errorHandled: errorHandled.promise };
}

async function request(port, path, secure = false) {
    const session = http2.connect(`${secure ? "https" : "http"}://127.0.0.1:${port}`, { rejectUnauthorized: false });
    try {
        return await new Promise((resolve, reject) => {
            session.once("error", reject);
            const stream = session.request({ ":path": path });
            const chunks = [];
            let status;
            stream.setEncoding("utf8");
            stream.once("response", (headers) => {
                status = headers[":status"];
            });
            stream.on("data", (chunk) => chunks.push(chunk));
            stream.once("error", reject);
            stream.once("end", () => resolve({ status, body: chunks.join("") }));
            stream.end();
        });
    } finally {
        session.destroy();
    }
}

const [key, cert] = await Promise.all([
    readFile(
        new URL("../../../../../jco-std/test/wasi/0.2.x/node/24.x.x/https/helpers/tls/localhost.key", import.meta.url),
    ),
    readFile(
        new URL("../../../../../jco-std/test/wasi/0.2.x/node/24.x.x/https/helpers/tls/localhost.crt", import.meta.url),
    ),
]);
const peer = http2.createServer();
peer.on("stream", (stream) => {
    stream.respond({ ":status": 201, "content-type": "text/plain" });
    stream.end("native peer");
});
await new Promise((resolve) => peer.listen(0, "127.0.0.1", resolve));
try {
    for (const secure of [false, true]) {
        const first = await createInstance();
        const second = await createInstance();
        const start = (instance) => (secure ? instance.startSecureServer(key, cert) : instance.startServer());
        try {
            assert.deepEqual(
                JSON.parse(await first.instance.runClient(`http://127.0.0.1:${peer.address().port}`, "/client", "")),
                {
                    status: 201,
                    contentType: "text/plain",
                    body: "native peer",
                },
            );
            const a = await start(first.instance);
            const b = await start(second.instance);
            assert.deepEqual(
                await Promise.all([
                    request(a, "/one", secure),
                    request(a, "/two", secure),
                    request(b, "/other", secure),
                ]),
                [
                    { status: 200, body: "server:/one" },
                    { status: 200, body: "server:/two" },
                    { status: 200, body: "server:/other" },
                ],
            );
            assert.equal(await first.instance.count(), 2);
            assert.equal(await second.instance.count(), 1);
            assert.deepEqual(first.taken, [1]);
            assert.deepEqual(second.taken, [1]);
            assert.deepEqual(await request(a, "/error", secure), { status: 500, body: "guest stream failed" });
            assert.deepEqual(await request(a, "/after-error", secure), { status: 200, body: "server:/after-error" });
            const large = await request(a, "/large", secure);
            assert.equal(large.status, 200);
            assert.equal(large.body, "s".repeat(131_072));

            // A malformed native client triggers the host's sessionError event and resource callback.
            const socket = secure
                ? connectTls({ port: a, host: "127.0.0.1", rejectUnauthorized: false, ALPNProtocols: ["h2"] })
                : connect(a, "127.0.0.1");
            try {
                socket.resume();
                socket.end("invalid HTTP/2 preface\r\n\r\n");
                const reason = await first.errorHandled;
                assert.equal(reason.code, "ERR_HTTP2_ERROR");
                assert.equal(await first.instance.lastError(), reason.code);
            } finally {
                socket.destroy();
            }

            const restarted = await first.instance.restartServer();
            assert.deepEqual(await request(restarted, "/restarted", secure), {
                status: 200,
                body: "server:/restarted",
            });
            assert.equal(await first.instance.count(), 6);
            assert.equal(await second.instance.count(), 1);
            assert.deepEqual(first.taken, [1, 1]);
            await first.instance.stopServer();
            assert.equal(await first.instance.http2Callbacks.takeStreamListener(1), undefined);
            assert.equal(await first.instance.http2Callbacks.takeServerErrorListener(2), undefined);
            await new Promise((resolve) => setTimeout(resolve, 5));
            assert.deepEqual(first.disposed.sort(), [1, 1, 2]);
        } finally {
            await first.instance.stopServer();
            await second.instance.stopServer();
        }
    }
    stdout.write(`${JSON.stringify({ plain: true, secure: true, isolated: true })}\n`);
} finally {
    await new Promise((resolve) => peer.close(resolve));
    clearTimeout(timeout);
}
