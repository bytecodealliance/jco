import { createServer } from "node:http";

let server;

export async function start() {
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
    console.error(`listening on ${server.address().port}`);

    // Wait here for as long as the server should run. A component only executes while a call
    // into it is in progress, so returning from this export would stop the server: on this
    // transport the guest owns the accept loop, and nothing would be left running to drive
    // it. Under Node the open socket keeps the process alive; this is that, written out.
    await new Promise(() => {});
}

export function stop() {
    server.close();
}
