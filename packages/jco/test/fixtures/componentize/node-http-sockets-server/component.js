import { createServer } from "node:http";

let server;

export function start() {
    server = createServer(async (request, response) => {
        request.setEncoding("utf8");
        const chunks = [];
        for await (const chunk of request) {
            chunks.push(chunk);
        }
        response.setHeader("Content-Type", "text/plain");
        response.end(`${request.method} ${request.url}: ${chunks.join("")}`);
    });

    server.listen(0, "127.0.0.1");

    // Reported before returning because `listen()` does not return on this transport: the
    // guest owns the accept loop, and it blocks inside this call for as long as it serves.
    console.error(`listening on ${server.address().port}`);
}

export function stop() {
    server.close();
}
