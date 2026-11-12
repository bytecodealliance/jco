import assert from "node:assert/strict";

import { instanceNetwork, tcpCreateSocket } from "../../../dist/nodejs/sockets.js";
import { monotonicClock } from "../../../dist/nodejs/clocks.js";
import { poll } from "../../../dist/nodejs/io.js";

const resources = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Register a WASI resource for disposal in reverse ownership order.
 * @param {object} resource Resource implementing Symbol.dispose.
 * @returns {object} The registered resource.
 */
function own(resource) {
    resources.push(resource);
    return resource;
}

/**
 * Connect two WASI TCP sockets through the shared IO worker.
 * @returns {object[]} The client and accepted socket with their input and output streams.
 */
function connect() {
    const network = instanceNetwork.instanceNetwork();
    const listener = own(tcpCreateSocket.createTcpSocket("ipv4"));
    const listenerPoll = own(listener.subscribe());
    listener.startBind(network, {
        tag: "ipv4",
        val: { address: [127, 0, 0, 1], port: 0 },
    });
    listenerPoll.block();
    listener.finishBind();
    listener.startListen();
    listenerPoll.block();
    listener.finishListen();

    const clientSocket = own(tcpCreateSocket.createTcpSocket("ipv4"));
    const clientPoll = own(clientSocket.subscribe());
    clientSocket.startConnect(network, listener.localAddress());
    clientPoll.block();
    const [clientInput, clientOutput] = clientSocket.finishConnect().map(own);
    listenerPoll.block();
    const [acceptedSocket, acceptedInput, acceptedOutput] = listener.accept().map(own);
    return [
        { socket: clientSocket, input: clientInput, output: clientOutput },
        { socket: acceptedSocket, input: acceptedInput, output: acceptedOutput },
    ];
}

/**
 * Read an exact byte count, allowing TCP to split it across chunks.
 * @param {object} input WASI input stream.
 * @param {number} length Number of bytes to read.
 * @returns {Buffer} All received bytes.
 */
function readBytes(input, length) {
    const chunks = [];
    let received = 0;
    while (received < length) {
        const chunk = input.blockingRead(BigInt(length - received));
        chunks.push(chunk);
        received += chunk.length;
    }
    return Buffer.concat(chunks);
}

/**
 * Assert that a closed input remains pollable and fails both read variants promptly.
 * @param {object} input WASI input stream.
 */
function checkClosedInput(input) {
    const pollable = own(input.subscribe());
    assert.equal(pollable.ready(), true);
    pollable.block();
    assert.throws(() => input.read(1n), { tag: "closed" });
    assert.throws(() => input.blockingRead(1n), { tag: "closed" });
}

/**
 * Assert that a shut-down output is ready and rejects further writes.
 * @param {object} output WASI output stream.
 */
function checkClosedOutput(output) {
    const pollable = own(output.subscribe());
    assert.equal(pollable.ready(), true);
    pollable.block();
    assert.throws(() => output.checkWrite(), { tag: "closed" });
    assert.throws(() => output.write(encoder.encode("late")), { tag: "closed" });
    assert.throws(() => output.blockingWriteAndFlush(encoder.encode("late")), { tag: "closed" });
}

try {
    const [client, accepted] = connect();
    const scenario = process.argv[2];
    if (scenario === "client-send" || scenario === "accepted-send") {
        const [sender, peer] = scenario === "client-send" ? [client, accepted] : [accepted, client];
        const data = encoder.encode("hello");
        assert(sender.output.checkWrite() >= BigInt(data.length));
        sender.output.write(data);
        sender.socket.shutdown("send");
        sender.socket.shutdown("send");
        checkClosedOutput(sender.output);
        assert.equal(decoder.decode(readBytes(peer.input, data.length)), "hello");
        assert.throws(() => peer.input.blockingRead(1n), { tag: "closed" });

        // The peer replies only after receiving FIN from the sender.
        peer.output.blockingWriteAndFlush(encoder.encode("received 5 bytes"));
        peer.socket.shutdown("send");
        assert.equal(decoder.decode(readBytes(sender.input, 16)), "received 5 bytes");
        assert.throws(() => sender.input.blockingRead(1n), { tag: "closed" });
    } else if (scenario === "receive") {
        accepted.output.blockingWriteAndFlush(encoder.encode("discard before shutdown"));
        own(client.input.subscribe()).block();
        client.socket.shutdown("receive");
        client.socket.shutdown("receive");
        checkClosedInput(client.input);
        accepted.output.blockingWriteAndFlush(encoder.encode("discard after shutdown"));
        checkClosedInput(client.input);
        client.output.blockingWriteAndFlush(encoder.encode("still writable"));
        assert.equal(decoder.decode(readBytes(accepted.input, 14)), "still writable");
        client.socket.shutdown("send");
        assert.throws(() => accepted.input.blockingRead(1n), { tag: "closed" });
    } else if (scenario === "both") {
        // Start a pending input poll before closing both directions.
        const inputPoll = own(client.input.subscribe());
        const timer = own(monotonicClock.subscribeDuration(0n));
        poll.poll([inputPoll, timer]);
        assert.equal(inputPoll.ready(), false);
        const data = encoder.encode("queued before shutdown");
        assert(client.output.checkWrite() >= BigInt(data.length));
        client.output.write(data);
        client.socket.shutdown("both");
        client.socket.shutdown("both");
        assert.equal(inputPoll.ready(), true);
        checkClosedInput(client.input);
        checkClosedOutput(client.output);
        assert.equal(decoder.decode(readBytes(accepted.input, data.length)), decoder.decode(data));
        assert.throws(() => accepted.input.blockingRead(1n), { tag: "closed" });
    } else if (scenario === "disposed-streams") {
        client.input[Symbol.dispose]();
        client.output[Symbol.dispose]();
        client.socket.shutdown("both");
        client.socket.shutdown("both");
        assert.throws(() => accepted.input.blockingRead(1n), { tag: "closed" });
    } else {
        throw new Error(`unknown scenario: ${scenario}`);
    }
} finally {
    for (const resource of resources.reverse()) {
        resource[Symbol.dispose]();
    }
}
