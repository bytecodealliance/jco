import assert from "node:assert/strict";
import http from "node:http";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const { createHttpHost } = await import(argv[3]);
async function createInstance() {
    const imports = new WASIShim().getImportObject();
    let instance;
    imports[argv[3]] = createHttpHost(() => instance.httpCallbacks);
    instance = await instantiate(undefined, imports);
    return instance;
}

function request(port, path = "/items", body = "hello") {
    return new Promise((resolve, reject) => {
        const request = http.request(`http://127.0.0.1:${port}${path}`, { method: "POST" }, (response) => {
            response.setEncoding("utf8");
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.once("end", () => resolve(chunks.join("")));
        });
        request.once("error", reject);
        request.end(body);
    });
}

const first = await createInstance();
const second = await createInstance();
try {
    const firstPort = await first.start();
    const secondPort = await second.start();
    const body = await request(firstPort);
    assert.equal(body, "POST /items: hello");
    assert.deepEqual(
        await Promise.all([
            request(firstPort, "/first", "one"),
            request(firstPort, "/second", "two"),
            request(secondPort, "/other", "three"),
        ]),
        ["POST /first: one", "POST /second: two", "POST /other: three"],
    );
    assert.equal(await first.count(), 3);
    assert.equal(await second.count(), 1);
    await first.stop();
    await assert.rejects(
        first.httpCallbacks.handle(1, {
            method: "GET",
            url: "/",
            httpVersion: "1.1",
            headers: [],
            body: new Uint8Array(),
        }),
        (error) => error.payload?.code === "ERR_JCO_HTTP_CALLBACK_NOT_FOUND",
    );
    const restartedPort = await first.start();
    assert.equal(await request(restartedPort), body);
    assert.equal(await first.count(), 4);
    assert.equal(await second.count(), 1);
    stdout.write(`${body}\n`);
} finally {
    await first.stop();
    await second.stop();
}
