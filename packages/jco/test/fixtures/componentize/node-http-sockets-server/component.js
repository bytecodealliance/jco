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

    // Wait here for as long as the server should run.
    //
    // A component only executes while a call into it is in progress. Returning from this
    // export would stop the server: on this transport the guest owns the accept loop, and
    // nothing would be left running to drive it.
    //
    // Under Node it is the open socket that keeps the process alive. This is the same thing,
    // written out.
    //
    // Serving from an export that returns needs component model async -- WASI 0.3.x, with an
    // interface whose functions are declared async -- so the guest can hold a task the host
    // keeps driving after the call completes. A component may mix Preview 2 interfaces with
    // component model async, but this one deliberately does not: it is Preview 2 throughout,
    // which is what the `wasi-sockets` implementation is built against.
    await new Promise(() => {});
}

export function stop() {
    server.close();
}
