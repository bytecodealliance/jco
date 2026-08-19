import {
    createFuture,
    createReadableStream,
    createReadableStreamPollState,
    createWritableStream,
    futureDispose,
    futureTakeValue,
    PollState,
    pollStateReady,
    verifyPollsDroppedForDrop,
} from "./worker-thread.js";
import process from "node:process";
import {
    convertSocketError,
    ipSocketAddress,
    isIPv4MappedAddress,
    isMulticastIpAddress,
    isUnicastIpAddress,
    isWildcardAddress,
    noLookup,
    serializeIpAddress,
    SOCKET_STATE_BIND,
    SOCKET_STATE_BOUND,
    SOCKET_STATE_CLOSED,
    SOCKET_STATE_CONNECT,
    SOCKET_STATE_CONNECTION,
    SOCKET_STATE_INIT,
    SOCKET_STATE_LISTEN,
    SOCKET_STATE_LISTENER,
} from "./worker-sockets.js";
import { Server, Socket as TcpSocket } from "node:net";
import { IpSocketAddress } from "../../types/interfaces/wasi-sockets-network.js";

const win = process.platform === "win32";

interface PendingAccept {
    tcpSocket: TcpSocket | null;
    err: Error | null;
    pollState: PollState | null;
}

interface TcpSocketRecord {
    state: number;
    future: number | null;
    tcpSocket: TcpSocket | null;
    server: Server | null;
    localAddress: IpSocketAddress | null;
    listenBacklogSize: number;
    keepAlive: boolean;
    keepAliveIdleTime: number;
    pendingAccepts: PendingAccept[];
    pollState: PollState | null;
}

export const tcpSockets: Map<number, TcpSocketRecord> = new Map();

let tcpSocketCnt = 0;

export function createTcpSocket() {
    tcpSockets.set(++tcpSocketCnt, {
        state: SOCKET_STATE_INIT,
        future: null,
        tcpSocket: null,
        server: null,
        localAddress: null,
        listenBacklogSize: 128,
        keepAlive: false,
        keepAliveIdleTime: 0,
        pendingAccepts: [],
        pollState: {
            ready: true,
            listener: null,
            polls: [],
            parentStream: null,
        },
    });
    return tcpSocketCnt;
}

export function socketTcpFinish(id: number, fromState, toState) {
    const socket = tcpSockets.get(id)!;
    if (socket.state !== fromState) {
        throw "not-in-progress";
    }
    if (!socket.pollState?.ready) {
        throw "would-block";
    }
    const { tag, val } = futureTakeValue(socket.future)?.val ?? {};
    futureDispose(socket.future, false);
    socket.future = null;
    if (tag === "err") {
        socket.state = SOCKET_STATE_CLOSED;
        throw val;
    } else {
        socket.state = toState;
        // for the listener, we must immediately transition back to unresolved
        if (toState === SOCKET_STATE_LISTENER) {
            socket.pollState.ready = socket.pendingAccepts.length > 0;
        }
        return val;
    }
}

export function socketTcpBindStart(id: number, localAddress, family) {
    const socket = tcpSockets.get(id)!;
    if (socket.state !== SOCKET_STATE_INIT) {
        throw "invalid-state";
    }
    if (
        family !== localAddress.tag ||
        !isUnicastIpAddress(localAddress) ||
        isIPv4MappedAddress(localAddress)
    ) {
        throw "invalid-argument";
    }
    socket.state = SOCKET_STATE_BIND;
    socket.future = createFuture(
        new Promise<void>((resolve, reject) => {
            const address = serializeIpAddress(localAddress);
            const port = localAddress.val.port;
            // node:net has no public standalone TCP bind API. Keep a server open
            // to reserve the endpoint, then reuse it for listen or close it for connect.
            const server = (socket.server = createTcpServer(socket));
            function handleErr(err) {
                server.off("listening", handleListen);
                reject(convertSocketError(err));
            }
            function handleListen() {
                server.off("error", handleErr);
                const boundAddress = server.address();
                if (!boundAddress || typeof boundAddress === "string") {
                    reject("invalid-state");
                    return;
                }
                socket.localAddress = ipSocketAddress(
                    boundAddress.family.toLowerCase() as IpSocketAddress["tag"],
                    boundAddress.address,
                    boundAddress.port,
                );
                resolve();
            }
            server.once("listening", handleListen);
            server.once("error", handleErr);
            server.listen({
                host: address ?? undefined,
                port,
                backlog: socket.listenBacklogSize,
                ipv6Only: family === "ipv6",
            });
        }),
        socket.pollState,
    );
}

function createTcpServer(socket: TcpSocketRecord) {
    const server = new Server({
        pauseOnConnect: true,
        allowHalfOpen: true,
    });
    server.on("connection", (tcpSocket) => {
        // The reservation is already listening at the OS level, so reject any
        // connections that arrive before the WASI socket enters its listen state.
        if (socket.state !== SOCKET_STATE_LISTEN && socket.state !== SOCKET_STATE_LISTENER) {
            tcpSocket.destroy();
            return;
        }
        pollStateReady(socket.pollState);
        const pollState = createReadableStreamPollState(tcpSocket);
        socket.pendingAccepts.push({
            tcpSocket,
            err: null,
            pollState,
        });
    });
    server.on("error", (err) => {
        if (socket.state === SOCKET_STATE_LISTEN || socket.state === SOCKET_STATE_LISTENER) {
            pollStateReady(socket.pollState);
            socket.pendingAccepts.push({
                tcpSocket: null,
                err,
                pollState: null,
            });
        }
    });
    return server;
}

function closeTcpServer(socket: TcpSocketRecord) {
    const server = socket.server;
    socket.server = null;
    if (!server) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
    });
}

export function socketTcpConnectStart(id: number, remoteAddress: IpSocketAddress, family) {
    const socket = tcpSockets.get(id)!;
    if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BOUND) {
        throw "invalid-state";
    }
    if (
        isWildcardAddress(remoteAddress) ||
        family !== remoteAddress.tag ||
        !isUnicastIpAddress(remoteAddress) ||
        isMulticastIpAddress(remoteAddress) ||
        remoteAddress.val.port === 0 ||
        isIPv4MappedAddress(remoteAddress)
    ) {
        throw "invalid-argument";
    }
    socket.state = SOCKET_STATE_CONNECT;
    socket.future = createFuture(
        (async () => {
            const localAddress = socket.localAddress;
            await closeTcpServer(socket);
            const tcpSocket = (socket.tcpSocket = new TcpSocket({
                allowHalfOpen: true,
            }));
            tcpSocket.setKeepAlive(socket.keepAlive, socket.keepAliveIdleTime);
            await new Promise<void>((resolve, reject) => {
                function handleErr(err) {
                    tcpSocket.off("connect", handleConnect);
                    reject(convertSocketError(err));
                }
                function handleConnect() {
                    tcpSocket.off("error", handleErr);
                    resolve();
                }
                tcpSocket.once("connect", handleConnect);
                tcpSocket.once("error", handleErr);
                tcpSocket.connect({
                    port: remoteAddress.val.port,
                    host: serializeIpAddress(remoteAddress) ?? undefined,
                    lookup: noLookup,
                    localAddress: localAddress
                        ? (serializeIpAddress(localAddress) ?? undefined)
                        : undefined,
                    localPort: localAddress?.val.port,
                });
            });
            return [createReadableStream(tcpSocket), createWritableStream(tcpSocket)];
        })(),
        socket.pollState,
    );
}

export function socketTcpListenStart(id: number) {
    const socket = tcpSockets.get(id)!;
    if (socket.state !== SOCKET_STATE_BOUND) {
        throw "invalid-state";
    }
    socket.state = SOCKET_STATE_LISTEN;
    socket.future = createFuture(Promise.resolve(), socket.pollState);
}

export function socketTcpAccept(id: number) {
    const socket = tcpSockets.get(id)!;
    if (socket.state !== SOCKET_STATE_LISTENER) {
        throw "invalid-state";
    }
    if (socket.pendingAccepts.length === 0) {
        throw "would-block";
    }
    const accept = socket.pendingAccepts.shift();
    if (!accept || accept.err) {
        socket.state = SOCKET_STATE_CLOSED;
        throw convertSocketError(accept?.err);
    }
    if (socket.pollState && socket.pendingAccepts.length === 0) {
        socket.pollState.ready = false;
    }
    tcpSockets.set(++tcpSocketCnt, {
        state: SOCKET_STATE_CONNECTION,
        future: null,
        tcpSocket: accept.tcpSocket,
        server: null,
        localAddress: null,
        listenBacklogSize: 128,
        keepAlive: false,
        keepAliveIdleTime: 0,
        pendingAccepts: [],
        pollState: accept.pollState,
    });
    return [
        tcpSocketCnt,
        // @ts-expect-error
        createReadableStream(accept.tcpSocket, accept.pollState ?? undefined),
        createWritableStream(accept.tcpSocket),
    ];
}

export function socketTcpSetListenBacklogSize(id: number, backlogSize) {
    const socket = tcpSockets.get(id)!;
    if (socket.state === SOCKET_STATE_LISTEN || socket.state === SOCKET_STATE_LISTENER) {
        throw "not-supported";
    }
    if (
        socket.state !== SOCKET_STATE_INIT &&
        socket.state !== SOCKET_STATE_BIND &&
        socket.state !== SOCKET_STATE_BOUND
    ) {
        throw "invalid-state";
    }
    socket.listenBacklogSize = Number(backlogSize);
}

export function socketTcpGetLocalAddress(id: number) {
    const socket = tcpSockets.get(id)!;
    const address = socket.tcpSocket?.address();
    if (address && typeof address !== "string" && "family" in address) {
        return ipSocketAddress(
            address.family.toLowerCase() as IpSocketAddress["tag"],
            address.address,
            address.port,
        );
    }
    if (socket.localAddress) {
        return socket.localAddress;
    }
    throw "invalid-state";
}

export function socketTcpGetRemoteAddress(id: number) {
    const { tcpSocket } = tcpSockets.get(id)!;
    if (!tcpSocket?.remoteFamily || !tcpSocket.remoteAddress || !tcpSocket.remotePort) {
        throw "invalid-state";
    }
    return ipSocketAddress(
        tcpSocket.remoteFamily.toLowerCase() as IpSocketAddress["tag"],
        tcpSocket.remoteAddress,
        tcpSocket.remotePort,
    );
}

export function socketTcpShutdown(id: number, _shutdownType) {
    const socket = tcpSockets.get(id)!;
    if (socket.state !== SOCKET_STATE_CONNECTION) {
        throw "invalid-state";
    }
    if (win && socket.tcpSocket?.destroySoon) {
        socket.tcpSocket.destroySoon();
    } else {
        socket.tcpSocket?.destroy();
    }
}

export function socketTcpSetKeepAlive(id: number, { keepAlive, keepAliveIdleTime }) {
    const socket = tcpSockets.get(id)!;
    socket.keepAlive = keepAlive;
    socket.keepAliveIdleTime = Number(keepAliveIdleTime / 1_000_000_000n);
    socket.tcpSocket?.setKeepAlive(socket.keepAlive, socket.keepAliveIdleTime);
}

export function socketTcpDispose(id: number) {
    const socket = tcpSockets.get(id)!;
    verifyPollsDroppedForDrop(socket.pollState, "tcp socket");
    socket.server?.close();
    socket.tcpSocket?.destroy();
    tcpSockets.delete(id);
}
