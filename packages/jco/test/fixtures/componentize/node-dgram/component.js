import dgram, { Socket, createSocket } from "node:dgram";
import * as namespace from "node:dgram";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";

let sockets = [];
let messages = [];
let sent = [];
let errors = [];
let listening = 0;
let connected = 0;
let closed = 0;

export function shape() {
    const socket = createSocket("udp4");
    const result = {
        keys: Object.keys(dgram).sort(),
        named: Object.keys(namespace).sort(),
        identity: dgram === namespace.default && dgram.Socket === Socket && dgram.createSocket === createSocket,
        socket: socket instanceof Socket && socket instanceof EventEmitter,
        ref: socket.ref().unref() === socket,
        type: socket.type,
    };
    socket.close();
    return JSON.stringify(result);
}
export function denied() {
    const socket = createSocket("udp4");
    try {
        socket.bind(0);
        return "unexpected success";
    } catch (error) {
        return error.code + ":" + error.message;
    } finally {
        socket.close();
    }
}
function watch(socket) {
    sockets.push(socket);
    socket.on("error", (error) => errors.push({ code: error.code, message: error.message }));
    socket.on("close", () => closed++);
    socket.on("listening", () => listening++);
    socket.on("connect", () => connected++);
    return socket;
}
export function start(ipv6) {
    const server = watch(new Socket({ type: ipv6 ? "udp6" : "udp4", ipv6Only: ipv6 }));
    server.on("message", (message, remote) => {
        messages.push({ bytes: Array.from(message), buffer: Buffer.isBuffer(message), remote });
        server.send(["echo:", message], remote.port, remote.address, (error, size) => {
            if (error) {
                errors.push({ code: error.code });
            } else {
                sent.push(size);
            }
        });
    });
    const address = server.bindSync({ address: ipv6 ? "::1" : "127.0.0.1" });
    server.setTTL(32);
    server.setBroadcast(true);
    server.setMulticastTTL(8);
    server.setMulticastLoopback(false);
    server.setRecvBufferSize(65536);
    server.setSendBufferSize(65536);
    if (server.getRecvBufferSize() < 65536 || server.getSendBufferSize() < 65536) {
        throw Error("buffer sizes");
    }
    if (server.getSendQueueCount() !== 0 || server.getSendQueueSize() !== 0) {
        throw Error("queue sizes");
    }
    return address.port;
}
export function client(port) {
    // Hostname resolution, implicit bind, connect, vector/empty/sliced sends and
    // byte accounting all run inside the component with ordinary Node imports.
    let received = 0;
    const done = (error, size) => (error ? errors.push({ code: error.code }) : sent.push(size));
    const socket = watch(
        createSocket("udp4", (message, remote) => {
            messages.push({ bytes: Array.from(message), buffer: Buffer.isBuffer(message), remote });
            if (++received === 4) {
                socket.disconnect();
                socket.sendto(Buffer.from("alias"), 1, 3, port, "127.0.0.1", done);
            }
        }),
    );
    socket.connect(port, "localhost", () => {
        if (socket.remoteAddress().port !== port) {
            throw Error("remote address");
        }
        socket.send("hello", done);
        socket.send(["a", new DataView(new Uint8Array([99, 0, 255]).buffer, 1)], done);
        socket.send([], done);
        socket.send(Buffer.from("slice"), 1, 3, done);
    });
}
export function status() {
    return JSON.stringify({ messages, sent, errors, listening, connected, closed });
}
export function stop() {
    for (const socket of sockets.splice(0)) {
        socket.close();
    }
}

export function contract() {
    let checked = 0;
    const throws = (code, operation) => {
        try {
            operation();
        } catch (error) {
            if (error.code !== code) {
                throw Error("Expected " + code + ", got " + error.code + ": " + error.message);
            }
            checked++;
            return;
        }
        throw Error("Expected " + code);
    };
    for (const type of [undefined, null, "tcp", {}, { type: "udp" }]) {
        throws("ERR_SOCKET_BAD_TYPE", () => createSocket(type));
    }
    throws("ERR_INVALID_ARG_TYPE", () => createSocket({ type: "udp4", lookup: 1 }));
    const socket = createSocket("udp4");
    for (const port of [0, -1, 65536, null, undefined, NaN]) {
        throws("ERR_SOCKET_BAD_PORT", () => socket.connect(port));
    }
    throws("ERR_SOCKET_DGRAM_NOT_CONNECTED", () => socket.disconnect());
    throws("ERR_SOCKET_DGRAM_NOT_CONNECTED", () => socket.remoteAddress());
    throws("ERR_INVALID_ARG_TYPE", () => socket.send());
    throws("ERR_INVALID_ARG_TYPE", () => socket.send(["ok", 23], 12345));
    throws("ERR_BUFFER_OUT_OF_BOUNDS", () =>
        socket.send(new DataView(new ArrayBuffer(5), 1), 5, 0, 12345, "127.0.0.1"),
    );
    throws("ERR_BUFFER_OUT_OF_BOUNDS", () => socket.send("abc", 0, 4, 12345, "127.0.0.1"));
    throws("ERR_SOCKET_BAD_BUFFER_SIZE", () => socket.setRecvBufferSize(-1));
    throws("ERR_SOCKET_BAD_BUFFER_SIZE", () => socket.setSendBufferSize(1.5));
    const poison = new Proxy(
        {},
        {
            get() {
                throw Error("deprecated argument touched");
            },
        },
    );
    throws("ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API", () => dgram._createSocketHandle(poison));
    for (const key of ["_handle", "_receiving", "_bindState", "_queue", "_reuseAddr"]) {
        throws("ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API", () => socket[key]);
        throws("ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API", () => {
            socket[key] = poison;
        });
    }
    throws("ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API", () => socket._healthCheck());
    throws("ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API", () => socket._stopReceiving());
    socket.close();
    throws("ERR_SOCKET_DGRAM_NOT_RUNNING", () => socket.close());
    throws("ERR_SOCKET_DGRAM_NOT_RUNNING", () => socket.address());
    return checked;
}

export function finish(port) {
    const socket = createSocket("udp4");
    socket.on("error", (error) => errors.push({ code: error.code }));
    socket.on("close", () => closed++);
    socket.connectSync(port, "127.0.0.1");
    socket.send("finish", (error, size) => {
        if (error) {
            errors.push({ code: error.code });
        } else {
            sent.push(size);
        }
    });
    socket.close();
}
