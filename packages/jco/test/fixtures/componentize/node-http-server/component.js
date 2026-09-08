import { createServer } from "node:http";

let server;
let requests = 0;

export function count() {
    return requests;
}

export function start() {
    server ??= createServer(async (request, response) => {
        request.setEncoding("utf8");
        const chunks = [];
        for await (const chunk of request) {
            chunks.push(chunk);
        }
        await Promise.resolve();
        requests++;
        response.setHeader("Content-Type", "text/plain");
        response.end(`${request.method} ${request.url}: ${chunks.join("")}`);
    });
    server.listen(0, "127.0.0.1");
    return server.address().port;
}

export function stop() {
    server.closeAllConnections();
    server.close();
}
