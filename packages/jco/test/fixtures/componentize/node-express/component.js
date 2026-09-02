import express from "express";

let server;

export function start() {
    const app = express();

    app.use(express.json());

    app.get("/", (request, response) => {
        response.send("Hello World!");
    });

    app.get("/items/:id", (request, response) => {
        response.json({ id: request.params.id, page: request.query.page ?? null });
    });

    app.post("/echo", (request, response) => {
        response.status(201).json({ echoed: request.body });
    });

    server = app.listen(0, "127.0.0.1");
    return server.address().port;
}

export function stop() {
    server.closeAllConnections();
    server.close();
}
