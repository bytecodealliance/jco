import { Fields, OutgoingRequest, OutgoingBody } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";

const dispose = Symbol.dispose || Symbol.for("dispose");

function fetchResponse(path) {
    const req = new OutgoingRequest(new Fields());
    req.setMethod({ tag: "get" });
    req.setScheme({ tag: "HTTP" });
    // The test supplies its ephemeral streaming server's address before componentizing.
    req.setAuthority("{{SERVER_AUTHORITY}}");
    req.setPathWithQuery(path);
    OutgoingBody.finish(req.body(), undefined);
    const future = handle(req, undefined);
    const ready = future.subscribe();
    ready.block();
    ready[dispose]();
    const result = future.get();
    if (!result || result.tag !== "ok" || result.val.tag !== "ok") {
        throw "request failed: " + JSON.stringify(result);
    }
    const response = result.val.val;
    // Exercise the component's canonical resource-drop path, not a host-side
    // prototype spy. Response headers are ready but the body is still live.
    future[dispose]();
    return response;
}

export const test = {
    run() {
        const response = fetchResponse("/stream");
        if (response.status() !== 200) {
            throw "expected 200";
        }
        const body = response.consume();
        response[dispose]();
        const stream = body.stream();

        const released = fetchResponse("/release");
        if (released.status() !== 204) {
            throw "expected 204";
        }
        released[dispose]();

        let text = "";
        try {
            for (;;) {
                text += new TextDecoder().decode(stream.blockingRead(64n));
            }
        } catch (err) {
            const error = err.payload || err;
            if (error.tag !== "closed") {
                throw "body read failed: " + JSON.stringify(error);
            }
        } finally {
            stream[dispose]();
            body[dispose]();
        }
        if (text !== "before disposal; after disposal") {
            throw "incomplete body: " + text;
        }
        return text;
    },
};
