import { parentPort } from 'worker_threads';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { serializeIpAddress, makeIpAddress } from '../sockets/address.js';

import dgram from 'node:dgram';

const sockets = new Map();

export function noLookup(ip, _opts, cb) {
    cb(null, ip);
}

parentPort.on('message', async (msg) => {
    const { id, op } = msg;

    try {
        let result;

        // All operations except "udp-create" require a valid socket ID
        if (op !== 'udp-create' && !sockets.has(msg.socketId)) {
            throw new Error('Invalid socket ID');
        }

        switch (op) {
            case 'udp-create':
                result = handleCreate(msg);
                break;
            case 'udp-bind':
                result = await handleBind(msg);
                break;
            case 'udp-connect':
                result = handleConnect(msg);
                break;
            case 'udp-disconnect':
                result = handleDisconnect(msg);
                break;
            case 'udp-send':
                result = await handleSend(msg);
                break;
            case 'udp-receive':
                result = await handleReceive(msg);
                break;
            case 'udp-get-local-address':
                result = handleGetLocal(msg);
                break;
            case 'udp-set-unicast-hop-limit':
                result = handleSetHop(msg);
                break;
            case 'udp-recv-buffer-size':
                result = handleRecvBuffer(msg);
                break;
            case 'udp-send-buffer-size':
                result = handleSendBuffer(msg);
                break;
            case 'udp-dispose':
                result = handleDispose(msg);
                break;
            default:
                throw new Error(`Unknown op ${op}`);
        }
        parentPort.postMessage({ id, result });
    } catch (error) {
        parentPort.postMessage({ id, error });
    }
});

function handleCreate({ family }) {
    const socketId = randomUUID();
    const type = family === 'ipv6' ? 'udp6' : 'udp4';
    const ipv6Only = family === 'ipv6';
    const udp = dgram.createSocket({
        type,
        ipv6Only,
        reuseAddr: false,
        lookup: noLookup,
    });

    udp.on('error', () => {});
    sockets.set(socketId, { udp, family, connected: null });

    return { socketId };
}

async function handleBind({ socketId, localAddress }) {
    const socket = sockets.get(socketId);
    const addr = serializeIpAddress(localAddress);
    const port = localAddress.val.port;

    const onListening = once(socket.udp, 'listening');
    const onError = once(socket.udp, 'error').then(([err]) => {
        throw err;
    });

    socket.udp.bind(port, addr);

    await Promise.race([onListening, onError]);
    return { success: true };
}

function handleConnect({ socketId, remoteAddress }) {
    const socket = sockets.get(socketId);
    const addr = serializeIpAddress(remoteAddress);
    const port = remoteAddress.val.port;

    socket.udp.connect(port, addr);
    socket.connected = remoteAddress;

    return { success: true };
}

function handleDisconnect({ socketId }) {
    const socket = sockets.get(socketId);
    socket.udp.disconnect();
    socket.connected = null;

    return { success: true };
}

async function handleSend({ socketId, data, remoteAddress }) {
    const socket = sockets.get(socketId);
    const isConnected = socket.connected != null;

    await new Promise((resolve, reject) => {
        if (isConnected) {
            socket.udp.send(data, (err) => (err ? reject(err) : resolve()));
        } else {
            const addr = serializeIpAddress(remoteAddress);
            const port = remoteAddress.val.port;

            socket.udp.send(data, port, addr, (err) =>
                err ? reject(err) : resolve()
            );
        }
    });

    return { success: true };
}

async function handleReceive({ socketId }) {
    const socket = sockets.get(socketId);

    const [event, payload] = await Promise.race([
        once(socket.udp, 'message').then(([msg, rinfo]) => [
            'message',
            { msg, rinfo },
        ]),
        once(socket.udp, 'error').then(([err]) => {
            throw err;
        }),
    ]);

    if (event === 'message') {
        const { msg, rinfo } = payload;
        return {
            data: msg,
            remoteAddress: makeIpAddress(
                socket.family,
                rinfo.address,
                rinfo.port
            ),
        };
    }
}

function handleGetLocal({ socketId }) {
    const socket = sockets.get(socketId);
    const addr = socket.udp.address();
    return makeIpAddress(socket.family, addr.address, addr.port);
}

function handleSetHop({ socketId, value }) {
    const socket = sockets.get(socketId);
    socket.udp.setTTL(value);
    return { success: true };
}

function handleRecvBuffer({ socketId }) {
    const socket = sockets.get(socketId);
    return BigInt(socket.udp.getRecvBufferSize());
}

function handleSendBuffer({ socketId }) {
    const socket = sockets.get(socketId);
    return BigInt(socket.udp.getSendBufferSize());
}

function handleDispose({ socketId }) {
    const socket = sockets.get(socketId);
    socket.udp.close();
    sockets.delete(socketId);
    return { success: true };
}
