import http2, { constants, createServer } from "node:http2";

let server;

export function startServer() {
    server = createServer();
    server.on("stream", (stream, headers) => {
        stream.respond({ ":status": 200, "content-type": "text/plain" });
        stream.end(`server:${headers[":path"]}`);
    });
    server.listen(0, "127.0.0.1");
    return server.address().port;
}

export function stopServer() {
    server?.close();
    server = undefined;
}

export async function runClient(authority) {
    const session = http2.connect(authority);
    await new Promise((resolve, reject) => {
        session.once("connect", resolve);
        session.once("error", reject);
    });
    const stream = session.request({
        [constants.HTTP2_HEADER_METHOD]: "POST",
        [constants.HTTP2_HEADER_PATH]: "/component",
    });
    const output = await new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(new TextDecoder().decode(chunk)));
        stream.once("error", reject);
        stream.once("end", () => resolve(chunks.join("")));
        stream.end("client");
    });
    session.close();
    return output;
}
