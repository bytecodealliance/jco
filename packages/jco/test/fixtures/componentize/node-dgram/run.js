import assert from "node:assert/strict";
import dgram from "node:dgram";
import { once } from "node:events";
import { argv } from "node:process";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const { createDgramHost } = await import(argv[3]);
async function createInstance() {
    const imports = new WASIShim().getImportObject();
    let instance;
    imports["jco:node/dgram@0.1.0"] = createDgramHost(() => instance.dgramCallbacks);
    instance = await instantiate(undefined, imports);
    return instance;
}
async function until(instance, condition) {
    for (let attempt = 0; attempt < 500; attempt++) {
        const state = JSON.parse(await instance.status());
        assert.deepEqual(state.errors, []);
        if (condition(state)) {
            return state;
        }
        await delay(10);
    }
    throw Error("UDP component timed out: " + (await instance.status()));
}
const first = await createInstance();
const second = await createInstance();
const native = dgram.createSocket("udp4");
const echo = dgram.createSocket("udp4");
const native6 = dgram.createSocket("udp6");
try {
    assert.deepEqual(JSON.parse(await first.shape()), {
        keys: ["Socket", "_createSocketHandle", "createSocket"],
        named: ["Socket", "_createSocketHandle", "createSocket", "default"],
        identity: true,
        socket: true,
        ref: true,
        type: "udp4",
    });
    const firstPort = await first.start(false);
    const secondPort = await second.start(false);
    const payloads = [Buffer.from("hello"), Buffer.from([0, 255, 42]), Buffer.alloc(0)];
    for (const [port, payload] of [
        [firstPort, payloads[0]],
        [firstPort, payloads[1]],
        [secondPort, payloads[2]],
    ]) {
        const response = once(native, "message");
        native.send(payload, port, "127.0.0.1");
        const [message, remote] = await response;
        assert.deepEqual(message, Buffer.concat([Buffer.from("echo:"), payload]));
        assert.equal(remote.port, port);
    }
    const state = await until(first, (state) => state.messages.length === 2 && state.sent.length === 2);
    assert.ok(
        state.messages.every(
            (message) =>
                message.buffer && message.remote.family === "IPv4" && message.remote.size === message.bytes.length,
        ),
    );
    assert.equal(JSON.parse(await second.status()).messages.length, 1);
    echo.on("message", (message, remote) => echo.send(message, remote.port, remote.address));
    echo.bind(0, "127.0.0.1");
    await once(echo, "listening");
    await first.client(echo.address().port);
    const client = await until(first, (state) => state.messages.length === 7 && state.sent.length === 7);
    assert.deepEqual(
        client.messages.slice(2).map((message) => message.bytes),
        [
            Array.from(Buffer.from("hello")),
            [97, 0, 255],
            [],
            Array.from(Buffer.from("lic")),
            Array.from(Buffer.from("lia")),
        ],
    );
    assert.equal(client.connected, 1);
    assert.equal(client.listening, 2);
    assert.deepEqual(client.sent.slice(2), [5, 3, 0, 3, 3]);
    const ipv6Port = await first.start(true);
    const ipv6Response = once(native6, "message");
    native6.send("ipv6", ipv6Port, "::1");
    const [ipv6Message, ipv6Remote] = await ipv6Response;
    assert.equal(ipv6Message.toString(), "echo:ipv6");
    assert.equal(ipv6Remote.family, "IPv6");
    await until(first, (state) => state.messages.length === 8 && state.sent.length === 8);
    await first.finish(echo.address().port);
    await until(first, (state) => state.sent.length === 9 && state.closed === 1);
    await first.stop();
    await second.stop();
    assert.equal(JSON.parse(await first.status()).closed, 4);
    assert.equal(await first.dgramCallbacks.takeSocketListener(1), undefined);
    process.stdout.write("UDP component passthrough OK\n");
} finally {
    await first.stop();
    await second.stop();
    native.close();
    native6.close();
    echo.close();
}
