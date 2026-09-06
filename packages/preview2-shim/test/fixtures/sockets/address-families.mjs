import assert from "node:assert/strict";

import { instanceNetwork, tcpCreateSocket, udpCreateSocket } from "../../../dist/nodejs/sockets.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

function loopback(family) {
    return family === "ipv4"
        ? { tag: family, val: { address: [127, 0, 0, 1], port: 0 } }
        : {
              tag: family,
              val: { address: [0, 0, 0, 0, 0, 0, 0, 1], port: 0, flowInfo: 0, scopeId: 0 },
          };
}

// Run unchanged under Node and Deno: all socket work happens in the shim's
// I/O worker, including Server.address(), Socket.address(), and UDP messages.
export function checkTcpAddresses(family) {
    const resources = [];
    const own = (resource) => {
        resources.push(resource);
        return resource;
    };
    try {
        const network = instanceNetwork.instanceNetwork();
        const listener = own(tcpCreateSocket.createTcpSocket(family));
        const listenerPoll = own(listener.subscribe());
        listener.startBind(network, loopback(family));
        listenerPoll.block();
        listener.finishBind();
        const bound = listener.localAddress();
        assert.equal(bound.tag, family);
        assert.deepEqual(bound.val.address, loopback(family).val.address);
        assert.ok(bound.val.port > 0);
        listener.startListen();
        listenerPoll.block();
        listener.finishListen();

        const client = own(tcpCreateSocket.createTcpSocket(family));
        const clientPoll = own(client.subscribe());
        client.startConnect(network, bound);
        clientPoll.block();
        client.finishConnect().forEach(own);
        listenerPoll.block();
        const [accepted, input, output] = listener.accept();
        [accepted, input, output].forEach(own);

        assert.deepEqual(client.remoteAddress(), bound);
        assert.deepEqual(accepted.localAddress(), bound);
        assert.deepEqual(accepted.remoteAddress(), client.localAddress());
        assert.equal(client.localAddress().tag, family);
    } finally {
        for (const resource of resources.reverse()) {
            resource[symbolDispose]();
        }
    }
}

export function checkUdpAddresses(family) {
    const resources = [];
    const own = (resource) => {
        resources.push(resource);
        return resource;
    };
    try {
        const network = instanceNetwork.instanceNetwork();
        const bind = () => {
            const socket = own(udpCreateSocket.createUdpSocket(family));
            const pollable = own(socket.subscribe());
            socket.startBind(network, loopback(family));
            pollable.block();
            socket.finishBind();
            const address = socket.localAddress();
            assert.equal(address.tag, family);
            assert.deepEqual(address.val.address, loopback(family).val.address);
            assert.ok(address.val.port > 0);
            return socket;
        };
        const receiver = bind();
        const sender = bind();
        const [incoming, unusedOutput] = receiver.stream(undefined);
        [incoming, unusedOutput].forEach(own);
        const [unusedInput, outgoing] = sender.stream(receiver.localAddress());
        [unusedInput, outgoing].forEach(own);
        assert.deepEqual(sender.remoteAddress(), receiver.localAddress());

        assert.ok(outgoing.checkSend() > 0n);
        const data = new TextEncoder().encode("loopback");
        assert.equal(outgoing.send([{ data, remoteAddress: undefined }]), 1n);
        own(incoming.subscribe()).block();
        const received = incoming.receive(1n);
        assert.equal(received.length, 1);
        assert.deepEqual(received[0].data, data);
        assert.deepEqual(received[0].remoteAddress, sender.localAddress());
    } finally {
        for (const resource of resources.reverse()) {
            resource[symbolDispose]();
        }
    }
}
