import { IncomingMessage, ServerResponse } from "node:http";
import express from "express";

// An ordinary Express application. Nothing inside `build()` knows it is in a component.
//
// It is built on first use rather than at module scope because `express()` resolves its
// default views directory with `path.resolve()`, and Jco's `node:path` reads the working
// directory from `wasi:cli/environment`, which cannot be called while the component is being
// pre-initialized. Deferring it to the first call is the whole difference from an ordinary
// Express program.
let app;

function build() {
    const app = express();

    app.use(express.json());

    app.use((request, response, next) => {
        response.setHeader("X-Chain", "ran");
        next();
    });

    app.get("/", (request, response) => {
        response.send("Hello World!");
    });

    app.get("/items/:id", (request, response) => {
        response.json({ id: request.params.id, page: request.query.page ?? null });
    });

    app.post("/raw", async (request, response) => {
        const chunks = [];
        for await (const chunk of request) {
            chunks.push(typeof chunk === "string" ? chunk : decoder.decode(chunk));
        }
        response.json({ raw: chunks.join("") });
    });

    app.post("/echo", (request, response) => {
        response.status(201).json({ echoed: request.body ?? null });
    });

    app.get("/boom", (request, response, next) => {
        next(new Error("deliberate failure"));
    });

    app.use((error, request, response, _next) => {
        response.status(503).json({ handled: error.message });
    });

    return app;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Hand one request to the application and return what it answered.
 *
 * `IncomingMessage` and `ServerResponse` are the same pair `http.Server` builds for every
 * request, so this is the application's ordinary request path with the socket left out.
 */
export async function handle(method, url, contentType, body) {
    const headers = [{ name: "host", value: encoder.encode("127.0.0.1") }];
    if (contentType) {
        headers.push({ name: "content-type", value: encoder.encode(contentType) });
    }
    if (body) {
        headers.push({ name: "content-length", value: encoder.encode(String(body.length)) });
    }

    const request = new IncomingMessage({
        method,
        url,
        httpVersion: "1.1",
        headers,
        body: encoder.encode(body ?? ""),
    });
    const response = new ServerResponse(request);

    app ??= build();
    app(request, response);
    const completed = await response._completed();

    return {
        status: completed.statusCode,
        contentType: completed.headers.find((header) => header.name.toLowerCase() === "content-type")
            ? decoder.decode(completed.headers.find((header) => header.name.toLowerCase() === "content-type").value)
            : "",
        etag: completed.headers.some((header) => header.name.toLowerCase() === "etag"),
        chained: completed.headers.some((header) => header.name.toLowerCase() === "x-chain"),
        body: decoder.decode(completed.body),
    };
}
