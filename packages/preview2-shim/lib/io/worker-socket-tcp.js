import {
  createFuture,
  createPoll,
  createReadableStream,
  createReadableStreamPollState,
  createWritableStream,
  futureDispose,
  futureTakeValue,
  pollStateReady,
  verifyPollsDroppedForDrop,
} from "./worker-thread.js";
const { TCP, constants: TCPConstants } = process.binding("tcp_wrap");
import {
  deserializeIpAddress,
  serializeIpAddress,
  isWildcardAddress,
  isUnicastIpAddress,
  isMulticastIpAddress,
  isIPv4MappedAddress,
} from "../nodejs/sockets/socket-common.js";
import {
  convertSocketError,
  convertSocketErrorCode,
} from "./worker-sockets.js";
import { Socket, Server } from "node:net";
import { platform } from "node:os";

// As a workaround, we store the bound address in a global map
// this is needed because 'address-in-use' is not always thrown when binding
// more than one socket to the same address
// TODO: remove this workaround when we figure out why!
const globalBoundAddresses = new Set();

const isWindows = platform() === "win32";

let stateCnt = 0;
export const SOCKET_STATE_INIT = ++stateCnt;
export const SOCKET_STATE_BIND = ++stateCnt;
export const SOCKET_STATE_BOUND = ++stateCnt;
export const SOCKET_STATE_LISTEN = ++stateCnt;
export const SOCKET_STATE_LISTENER = ++stateCnt;
export const SOCKET_STATE_CONNECT = ++stateCnt;
export const SOCKET_STATE_CONNECTION = ++stateCnt;
export const SOCKET_STATE_CLOSED = ++stateCnt;

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 *
 * @typedef {{
 *   tcpSocket: number | null,
 *   err: Error | null,
 *   pollState: PollState | null,
 * }} PendingAccept
 *
 * @typedef {{
 *   state: number,
 *   future: number | null,
 *   serializedLocalAddress: string | null,
 *   listenBacklogSize: number,
 *   handle: TCP,
 *   pendingAccepts: PendingAccept[],
 *   pollState: PollState,
 * }} SocketRecord
 */

/**
 * @type {Map<number, SocketRecord>}
 */
export const tcpSockets = new Map();

let tcpSocketCnt = 0;

/**
 * @param {IpAddressFamily} addressFamily
 */
export function createTcpSocket() {
  const handle = new TCP(TCPConstants.SOCKET);
  tcpSockets.set(++tcpSocketCnt, {
    state: SOCKET_STATE_INIT,
    future: null,
    serializedLocalAddress: null,
    listenBacklogSize: 128,
    handle,
    pendingAccepts: [],
    pollState: { ready: true, listener: null, polls: [], parentStream: null },
  });
  return tcpSocketCnt;
}

export function socketTcpSubscribe(id) {
  return createPoll(tcpSockets.get(id).pollState);
}

export function socketTcpFinish(id, fromState, toState) {
  const socket = tcpSockets.get(id);
  if (socket.state !== fromState) throw "not-in-progress";
  if (!socket.pollState.ready) throw "would-block";
  const { tag, val } = futureTakeValue(socket.future).val;
  futureDispose(socket.future, false);
  socket.future = null;
  if (tag === "err") {
    socket.state = SOCKET_STATE_CLOSED;
    throw val;
  } else {
    socket.state = toState;
    // for the listener, we must immediately transition back to unresolved
    if (toState === SOCKET_STATE_LISTENER)
      socket.pollState.ready = false;
    return val;
  }
}

export function socketTcpBindStart(id, localAddress, family) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_INIT) throw "invalid-state";
  if (family !== localAddress.tag || !isUnicastIpAddress(localAddress))
    throw "invalid-argument";
  if (isIPv4MappedAddress(localAddress)) throw "invalid-argument";
  socket.state = SOCKET_STATE_BIND;
  const { handle } = socket;
  socket.future = createFuture(
    (async () => {
      const address = serializeIpAddress(localAddress);
      const port = localAddress.val.port;
      if (globalBoundAddresses.has(`${address}:${port}`))
        throw "address-in-use";
      const code =
        localAddress.tag === "ipv6"
          ? handle.bind6(address, port, TCPConstants.UV_TCP_IPV6ONLY)
          : handle.bind(address, port);
      if (code !== 0) throw convertSocketErrorCode(-code);
      {
        const localAddress = socketTcpGetLocalAddress(id);
        const serializedLocalAddress = `${serializeIpAddress(localAddress)}:${
          localAddress.val.port
        }`;
        globalBoundAddresses.add(
          (socket.serializedLocalAddress = serializedLocalAddress)
        );
      }
    })(),
    socket.pollState
  );
}

export function socketTcpConnectStart(id, remoteAddress, family) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BOUND)
    throw "invalid-state";
  if (remoteAddress.val.port === 0 && isWindows) throw "invalid-argument";
  if (
    isWildcardAddress(remoteAddress) ||
    family !== remoteAddress.tag ||
    !isUnicastIpAddress(remoteAddress) ||
    isMulticastIpAddress(remoteAddress) ||
    remoteAddress.val.port === 0
  ) {
    throw "invalid-argument";
  }
  if (isIPv4MappedAddress(remoteAddress)) throw "invalid-argument";
  socket.state = SOCKET_STATE_CONNECT;
  socket.future = createFuture(
    new Promise((resolve, reject) => {
      const tcpSocket = new Socket({
        handle: socket.handle,
        pauseOnCreate: true,
        allowHalfOpen: true,
      });
      function handleErr(err) {
        tcpSocket.off("connect", handleConnect);
        reject(err);
      }
      function handleConnect() {
        tcpSocket.off("error", handleErr);
        if (!tcpSocket.serializedLocalAddress) {
          const localAddress = socketTcpGetLocalAddress(id);
          const serializedLocalAddress = `${serializeIpAddress(localAddress)}:${
            localAddress.val.port
          }`;
          globalBoundAddresses.add(
            (tcpSocket.serializedLocalAddress = serializedLocalAddress)
          );
        }
        resolve([
          createReadableStream(tcpSocket),
          createWritableStream(tcpSocket),
        ]);
      }
      tcpSocket.once("connect", handleConnect);
      tcpSocket.once("error", handleErr);
      tcpSocket.connect({
        port: remoteAddress.val.port,
        host: serializeIpAddress(remoteAddress),
        lookup: () => {
          throw "invalid-argument";
        },
      });
    }),
    socket.pollState
  );
}

export function socketTcpListenStart(id) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_BOUND) throw "invalid-state";
  const { handle } = socket;
  socket.state = SOCKET_STATE_LISTEN;
  socket.future = createFuture(
    new Promise((resolve, reject) => {
      const server = new Server({ pauseOnConnect: true, allowHalfOpen: true });
      function handleErr(err) {
        server.off("listening", handleListen);
        reject(err);
      }
      function handleListen() {
        server.off("error", handleErr);
        server.on("connection", (tcpSocket) => {
          pollStateReady(socket.pollState);
          const pollState = createReadableStreamPollState(tcpSocket);
          socket.pendingAccepts.push({ tcpSocket, err: null, pollState });
        });
        server.on("error", (err) => {
          pollStateReady(socket.pollState);
          socket.pendingAccepts.push({ tcpSocket: null, err, pollState: null });
        });
        resolve();
      }
      server.once("listening", handleListen);
      server.once("error", handleErr);
      server.listen(handle, socket.listenBacklogSize);
    }),
    socket.pollState
  );
}

export function socketTcpAccept(id) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_LISTENER) throw "invalid-state";
  if (socket.pendingAccepts.length === 0) throw "would-block";
  const accept = socket.pendingAccepts.shift();
  if (accept.err) {
    socket.state = SOCKET_STATE_CLOSED;
    throw convertSocketError(accept.err);
  }
  if (socket.pendingAccepts.length === 0)
    socket.pollState.ready = false;
  tcpSockets.set(++tcpSocketCnt, {
    state: SOCKET_STATE_CONNECTION,
    future: null,
    serializedLocalAddress: null,
    listenBacklogSize: 128,
    handle: accept.tcpSocket._handle,
    pendingAccepts: [],
    pollState: accept.pollState,
  });
  return [
    tcpSocketCnt,
    createReadableStream(accept.tcpSocket, accept.pollState),
    createWritableStream(accept.tcpSocket),
  ];
}

export function socketTcpIsListening(id) {
  return tcpSockets.get(id).state === SOCKET_STATE_LISTENER;
}

export function socketTcpSetListenBacklogSize(id, backlogSize) {
  const socket = tcpSockets.get(id);
  if (
    socket.state === SOCKET_STATE_LISTEN ||
    socket.state === SOCKET_STATE_LISTENER
  )
    throw "not-supported";
  if (
    socket.state !== SOCKET_STATE_INIT &&
    socket.state !== SOCKET_STATE_BIND &&
    socket.state !== SOCKET_STATE_BOUND
  )
    throw "invalid-state";
  socket.listenBacklogSize = Number(backlogSize);
}

export function socketTcpGetLocalAddress(id) {
  const { handle } = tcpSockets.get(id);
  const out = {};
  const code = handle.getsockname(out);
  if (code !== 0) throw convertSocketErrorCode(-code);
  const family = out.family.toLowerCase();
  const { address, port } = out;
  return {
    tag: family,
    val: {
      address: deserializeIpAddress(address, family),
      port,
    },
  };
}

export function socketTcpGetRemoteAddress(id) {
  const { handle } = tcpSockets.get(id);
  const out = {};
  const code = handle.getpeername(out);
  if (code !== 0) throw convertSocketErrorCode(-code);
  const family = out.family.toLowerCase();
  const { address, port } = out;
  return {
    tag: family,
    val: {
      address: deserializeIpAddress(address, family),
      port,
    },
  };
}

// Node.js only supports a write shutdown
// so we don't actually check the shutdown type
export function socketTcpShutdown(id, _shutdownType) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_CONNECTION) throw "invalid-state";
  if (socket.socket) socket.socket.end();
}

export function socketTcpSetKeepAlive(id, { keepAlive, keepAliveIdleTime }) {
  const { handle } = tcpSockets.get(id);
  const code = handle.setKeepAlive(
    keepAlive,
    Number(keepAliveIdleTime / 1_000_000_000n)
  );
  if (code !== 0) throw convertSocketErrorCode(-code);
}

export function socketTcpDispose(id) {
  const socket = tcpSockets.get(id);
  verifyPollsDroppedForDrop(socket.pollState, "tcp socket");
  if (socket.serializedLocalAddress)
    globalBoundAddresses.delete(socket.serializedLocalAddress);
  socket.handle.close();
  tcpSockets.delete(id);
}
