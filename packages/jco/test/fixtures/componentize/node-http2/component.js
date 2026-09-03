import "./encoding-globals.js";
import http2, { constants, createServer } from "node:http2";

let server;
let handled;
let markHandled;

export function startServer() {
    handled = new Promise((resolve) => (markHandled = resolve));
    server = createServer();
    server.on("stream", (stream, headers) => {
        stream.respond({ ":status": 200, "content-type": "text/plain" });
        const body = headers[":path"] === "/large" ? "s".repeat(131_072) : `server:${headers[":path"]}`;
        stream.end(body, () => queueMicrotask(markHandled));
    });
    server.listen(0, "127.0.0.1");
    return server.address().port;
}

export async function serveOne() {
    await handled;
}

export function stopServer() {
    server?.close();
    server = undefined;
}

export async function runClient(authority, path, requestAuthority) {
    const session = http2.connect(authority);
    await new Promise((resolve, reject) => {
        session.once("connect", resolve);
        session.once("error", reject);
    });
    const stream = session.request({
        [constants.HTTP2_HEADER_METHOD]: "POST",
        [constants.HTTP2_HEADER_PATH]: path,
        ...(requestAuthority ? { [constants.HTTP2_HEADER_AUTHORITY]: requestAuthority } : {}),
    });
    const output = await new Promise((resolve, reject) => {
        const chunks = [];
        let status;
        let contentType;
        stream.once("response", (headers) => {
            status = headers[constants.HTTP2_HEADER_STATUS];
            contentType = headers[constants.HTTP2_HEADER_CONTENT_TYPE];
        });
        stream.on("data", (chunk) => chunks.push(new TextDecoder().decode(chunk)));
        stream.once("error", reject);
        stream.once("end", () => resolve(JSON.stringify({ status, contentType, body: chunks.join("") })));
        stream.end(path === "/large" ? "x".repeat(131_072) : "client");
    });
    session.close();
    return output;
}
