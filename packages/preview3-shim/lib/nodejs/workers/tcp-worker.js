import { Socket, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { once } from 'node:events';

import { Router } from '../workers/resource-worker.js';
import { serializeIpAddress, makeIpAddress } from '../sockets/address.js';
import { SocketError } from '../sockets/error.js';

import process from 'node:process';
const { TCP, constants: TCPConstants } = process.binding('tcp_wrap');

// Socket instances stored by ID
const sockets = new Map();

// Handle worker messages
Router()
    .beforeAll((msg) => {
        if (msg.op !== 'tcp-create' && !sockets.has(msg.socketId)) {
            throw new Error('Invalid socket ID');
        }
    })
    .op('tcp-create', handleTcpCreate)
    .op('tcp-bind', handleTcpBind)
    .op('tcp-connect', handleTcpConnect)
    .op('tcp-listen', handleTcpListen)
    .op('tcp-send', handleTcpSend)
    .op('tcp-receive', handleTcpReceive)
    .op('tcp-get-local-address', handleGetLocalAddress)
    .op('tcp-get-remote-address', handleGetRemoteAddress)
    .op('tcp-set-listen-backlog-size', handleTcpSetBacklogSize)
    .op('tcp-set-keep-alive', handleTcpSetKeepAlive)
    .op('tcp-recv-buffer-size', handleRecvBufferSize)
    .op('tcp-send-buffer-size', handleSendBufferSize)
    .op('tcp-dispose', handleTcpDispose);

// Create a new TCP socket
function handleTcpCreate({ family }) {
    const socketId = randomUUID();
    const handle = new TCP(TCPConstants.SOCKET);

    sockets.set(socketId, {
        handle,
        family,
        tcp: null,
        backlog: 128,
    });

    return { socketId };
}

// Bind a socket to local address
async function handleTcpBind({ socketId, localAddress }) {
    const socket = sockets.get(socketId);
    const address = serializeIpAddress(localAddress);
    const port = localAddress.val.port;

    const { handle, family } = socket;

    await new Promise((resolve, reject) => {
        let code;
        if (family === 'ipv6') {
            code = handle.bind6(address, port, TCPConstants.UV_TCP_IPV6ONLY);
        } else {
            code = handle.bind(address, port);
        }

        if (code !== 0) {
            reject(SocketError.from(-code));
        } else {
            resolve();
        }
    });

    return { success: true };
}

// Connect a socket to remote address
async function handleTcpConnect({ socketId, remoteAddress }) {
    const socket = sockets.get(socketId);
    const host = serializeIpAddress(remoteAddress);
    const port = remoteAddress.val.port;

    const tcp = (socket.tcp = new Socket({
        handle: socket.handle,
        pauseOnCreate: true,
        allowHalfOpen: true,
    }));

    const onConnect = once(tcp, 'connect');
    const onError = once(tcp, 'error').then(([err]) => {
        throw err;
    });

    // TODO(tandr): Add lookup
    tcp.connect({ port, host });

    await Promise.race([onConnect, onError]);

    return { success: true };
}

async function handleTcpListen({ socketId, stream }) {
    const writer = stream.getWriter();
    const socket = sockets.get(socketId);
    const { handle, backlog, family } = socket;

    const server = new Server({
        pauseOnConnect: true,
        allowHalfOpen: true,
    });

    const onListening = once(server, 'listening');
    const onError = once(server, 'error').then(([err]) => {
        throw err;
    });

    server.listen(handle, backlog);

    await Promise.race([onListening, onError]);

    server.on('connection', (conn) => {
        const id = randomUUID();
        sockets.set(id, { handle: conn._handle, family, backlog, tcp: conn });
        writer.write({ family, socketId: id });
    });

    server.on('error', (err) => stream.abort(err));
    // TODO(tandr): Handle server close

    return { success: true };
}

async function handleTcpSend({ socketId, stream }) {
    const socket = sockets.get(socketId);
    const { tcp } = socket;
    const readable = Readable.fromWeb(stream);

    // TODO(tandr): Should we handle FIN packet?
    await pipeline(readable, tcp);
    return { success: true };
}

async function handleTcpReceive({ socketId, stream }) {
    const socket = sockets.get(socketId);
    const { tcp } = socket;

    const writable = Writable.fromWeb(stream);
    await pipeline(tcp, writable);
    return { success: true };
}

async function handleGetLocalAddress({ socketId }) {
    const socket = sockets.get(socketId);
    const out = {};

    const code = socket.handle.getsockname(out);
    if (code !== 0) {
        throw new SocketError.from(-code);
    }

    return makeIpAddress(out.family.toLowerCase(), out.address, out.port);
}

async function handleGetRemoteAddress({ socketId }) {
    const socket = sockets.get(socketId);
    const out = {};

    const code = socket.handle.getpeername(out);
    if (code !== 0) {
        throw new SocketError.from(-code);
    }

    return makeIpAddress(out.family.toLowerCase(), out.address, out.port);
}

function handleTcpSetBacklogSize({ socketId, value }) {
    const socket = sockets.get(socketId);
    socket.backlog = Number(value);
}

async function handleTcpSetKeepAlive({
    socketId,
    keepAliveEnabled,
    keepAliveIdleTime,
}) {
    const socket = sockets.get(socketId);
    const time = Number(keepAliveIdleTime / 1_000_000_000n);

    const code = socket.handle.setKeepAlive(keepAliveEnabled, time);
    if (code !== 0) {
        throw mapErrorCode(-code);
    }
}

async function handleRecvBufferSize({ socketId }) {
    const socket = sockets.get(socketId);

    if (socket.tcp) {
        return BigInt(socket.tcp.getRecvBufferSize());
    } else {
        return await getDefaultReceiveBufferSize();
    }
}

async function handleSendBufferSize({ socketId }) {
    const socket = sockets.get(socketId);
    if (socket.tcp) {
        return BigInt(socket.tcp.getSendBufferSize());
    } else {
        return await getDefaultSendBufferSize();
    }
}

function handleTcpDispose({ socketId }) {
    const socket = sockets.get(socketId);

    if (socket.tcp) {
        socket.tcp.destroy();
    }
    if (socket.handle) {
        socket.handle.close();
    }

    sockets.delete(socketId);
}

let _recvBufferSize, _sendBufferSize;
async function getDefaultBufferSizes() {
    var s = new Socket({ type: 'udp4' });
    s.bind(0);
    await new Promise((resolve, reject) => {
        s.once('error', reject);
        s.once('listening', resolve);
    });
    _recvBufferSize = BigInt(s.getRecvBufferSize());
    _sendBufferSize = BigInt(s.getSendBufferSize());
    s.close();
}

export async function getDefaultSendBufferSize() {
    if (!_sendBufferSize) {
        await getDefaultBufferSizes();
    }
    return _sendBufferSize;
}

export async function getDefaultReceiveBufferSize() {
    if (!_recvBufferSize) {
        await getDefaultBufferSizes();
    }
    return _recvBufferSize;
}
