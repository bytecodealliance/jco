import http from "node:http";

const server = http.createServer((_request, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.end("hello from node:http");
});
server.listen(0, "127.0.0.1", () => process.send(server.address().port));
