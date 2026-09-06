import { Fields, OutgoingRequest, IncomingBody } from "wasi:http/types@0.2.8";
import { handle } from "wasi:http/outgoing-handler@0.2.8";
import { poll } from "wasi:io/poll@0.2.8";

const authority = "TEST_AUTHORITY";
const dispose = (resource) => resource[Symbol.dispose || Symbol.for("dispose")]();

function check(condition, message) {
    if (!condition) {
        throw message;
    }
}

function request(path) {
    const headers = Fields.fromList([]);
    const outgoing = new OutgoingRequest(headers);
    outgoing.setMethod({ tag: "get" });
    outgoing.setScheme({ tag: "HTTP" });
    outgoing.setAuthority(authority);
    outgoing.setPathWithQuery(path);
    const future = handle(outgoing, undefined);
    const ready = future.subscribe();
    ready.block();
    dispose(ready);
    const result = future.get();
    check(result?.tag === "ok" && result.val.tag === "ok", `request failed: ${path}`);
    dispose(future);
    // headers and outgoing were transferred into their consuming WASI calls.
    return result.val.val;
}

function control(path) {
    const response = request(path);
    check(response.status() === 204, `control failed: ${path}`);
    dispose(response);
}

function expectError(operation, tag) {
    try {
        operation();
    } catch (error) {
        const value = error.payload ?? error;
        check(value.tag === tag, `expected ${tag}, received ${value.tag}`);
        return value;
    }
    throw `expected ${tag}`;
}

function finish(response, body, stream, ready) {
    dispose(ready);
    dispose(stream);
    const trailers = IncomingBody.finish(body);
    dispose(trailers);
    dispose(response);
}

export const test = {
    run() {
        const response = request("/body");
        check(response.status() === 200, "missing response headers");
        const body = response.consume();
        const stream = body.stream();
        const ready = stream.subscribe();

        // The server will not send bytes until this guest requests /first.
        // This must cross the non-suspending canonical ABI as ok([]), not throw.
        check(stream.read(64n).length === 0, "initial read must be empty");
        check(stream.skip(64n) === 0n, "initial skip must be empty");
        check(stream.blockingRead(0n).length === 0, "zero read must not wait");
        check(stream.blockingSkip(0n) === 0n, "zero skip must not wait");
        check(!ready.ready(), "body ready before first chunk");
        control("/first");
        check(poll([ready])[0] === 0, "first poll did not select body");

        let first = "";
        while (first.length < 4) {
            first += new TextDecoder().decode(stream.blockingRead(BigInt(4 - first.length)));
        }
        check(first === "abcd", "first chunk corrupted");
        check(stream.read(64n).length === 0, "inter-chunk read must be empty");
        check(!ready.ready(), "drained body still ready");

        control("/second");
        check(stream.blockingSkip(1n) === 1n, "blocking skip failed");
        check(new TextDecoder().decode(stream.blockingRead(1n)) === "f", "second chunk corrupted");
        control("/finish");
        ready.block();
        expectError(() => stream.read(1n), "closed");
        expectError(() => stream.blockingRead(0n), "closed");
        finish(response, body, stream, ready);

        const brokenResponse = request("/broken");
        const brokenBody = brokenResponse.consume();
        const brokenStream = brokenBody.stream();
        const brokenReady = brokenStream.subscribe();
        check(brokenStream.read(1n).length === 0, "broken body must initially be empty");
        control("/abort");
        brokenReady.block();
        const failure = expectError(() => brokenStream.read(1n), "last-operation-failed");
        check(typeof failure.val.toDebugString() === "string", "missing IO error resource");
        dispose(failure.val);
        expectError(() => brokenStream.read(1n), "closed");
        finish(brokenResponse, brokenBody, brokenStream, brokenReady);
        return "empty reads, streaming, polling, EOF, and IO errors passed";
    },
};
