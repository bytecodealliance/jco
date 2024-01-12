import {
  createReadableStream,
  createWritableStream,
  createPoll,
  pollStateReady,
  pollStateWait,
  verifyPollsDroppedForDrop,
} from "./worker-thread.js";
// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const { TCP, constants: TCPConstants } = process.binding("tcp_wrap");
import {
  deserializeIpAddress,
  serializeIpAddress,
  isIPv4MappedAddress,
  isWildcardAddress,
  isUnicastIpAddress,
  isMulticastIpAddress,
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
const SOCKET_STATE_INIT = ++stateCnt;
const SOCKET_STATE_BIND = ++stateCnt;
const SOCKET_STATE_BOUND = ++stateCnt;
const SOCKET_STATE_LISTEN = ++stateCnt;
const SOCKET_STATE_LISTENER = ++stateCnt;
const SOCKET_STATE_CONNECT = ++stateCnt;
const SOCKET_STATE_CONNECTION = ++stateCnt;
const SOCKET_STATE_ERROR = ++stateCnt;

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 *
 * @typedef {{
 *   tcpSocket: number | null,
 *   err: Error | null,
 * }} PendingAccept
 *
 * @typedef {{
 *   state: number,
 *   bindOrConnectAddress: IpSocketAddress | null,
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
    bindOrConnectAddress: null,
    serializedLocalAddress: null,
    listenBacklogSize: 128,
    handle,
    pendingAccepts: [],
    pollState: { ready: false, listener: null, polls: [] },
  });
  return tcpSocketCnt;
}

export function socketTcpSubscribe(id) {
  const socket = tcpSockets.get(id);
  return createPoll(socket.pollState);
}

export function socketTcpBindStart(id, localAddress) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_INIT) throw "invalid-state";
  socket.state = SOCKET_STATE_BIND;
  socket.bindOrConnectAddress = localAddress;
  pollStateWait(socket.pollState, id);
}

export function socketTcpBindFinish(id, isIpV6Only) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_BIND) throw "not-in-progress";
  const { handle } = socket;
  const address = serializeIpAddress(socket.bindOrConnectAddress);
  const port = socket.bindOrConnectAddress.val.port;
  if (globalBoundAddresses.has(`${address}:${port}`)) throw "address-in-use";
  const code =
    socket.bindOrConnectAddress.tag === "ipv6"
      ? handle.bind6(
          address,
          port,
          isIpV6Only ? TCPConstants.UV_TCP_IPV6ONLY : 0
        )
      : handle.bind(address, port);
  if (code !== 0) {
    socket.state = SOCKET_STATE_ERROR;
    throw convertSocketErrorCode(-code);
  }
  const localAddress = socketTcpGetLocalAddress(id);
  const serializedLocalAddress = `${serializeIpAddress(localAddress)}:${
    localAddress.val.port
  }`;
  globalBoundAddresses.add(
    (socket.serializedLocalAddress = serializedLocalAddress)
  );
  socket.state = SOCKET_STATE_BOUND;
  pollStateReady(socket.pollState);
}

export function socketTcpConnectStart(id, { remoteAddress, family, ipv6Only }) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BOUND)
    throw "invalid-state";
  if (remoteAddress.val.port === 0 && isWindows) throw "invalid-argument";
  if (
    isWildcardAddress(remoteAddress) ||
    family !== remoteAddress.tag ||
    !isUnicastIpAddress(remoteAddress) ||
    isMulticastIpAddress(remoteAddress) ||
    remoteAddress.val.port === 0 ||
    (ipv6Only && isIPv4MappedAddress(remoteAddress))
  ) {
    throw "invalid-argument";
  }
  socket.state = SOCKET_STATE_CONNECT;
  socket.bindOrConnectAddress = remoteAddress;
  pollStateWait(socket.pollState, id);
}

export function socketTcpConnectFinish(id) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_CONNECT) throw "not-in-progress";
  const tcpSocket = new Socket({ handle: socket.handle, pauseOnCreate: true, allowHalfOpen: true });
  const remoteAddress = socket.bindOrConnectAddress;
  return new Promise((resolve, reject) => {
    function handleErr(err) {
      tcpSocket.off("connect", handleConnect);
      socket.state = SOCKET_STATE_ERROR;
      pollStateReady(socket.pollState);
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
      socket.state = SOCKET_STATE_CONNECTION;
      pollStateReady(socket.pollState);
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
  });
}

export function socketTcpAccept(id) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_LISTENER) throw "invalid-state";
  if (socket.pendingAccepts.length === 0) throw "would-block";
  const accept = socket.pendingAccepts.shift();
  if (accept.err) throw convertSocketError(accept.err);
  tcpSockets.set(++tcpSocketCnt, {
    state: SOCKET_STATE_CONNECTION,
    bindOrConnectAddress: null,
    serializedLocalAddress: null,
    listenBacklogSize: 128,
    handle: accept.tcpSocket._handle,
    pendingAccepts: [],
    pollState: { ready: false, listener: null, polls: [] },
  });
  return [
    tcpSocketCnt,
    createReadableStream(accept.tcpSocket),
    createWritableStream(accept.tcpSocket),
  ];
}

export function socketTcpListenStart(id) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_BOUND) throw "invalid-state";
  socket.state = SOCKET_STATE_LISTEN;
}

export function socketTcpListenFinish(id, backlogSize) {
  const socket = tcpSockets.get(id);
  if (socket.state !== SOCKET_STATE_LISTEN) throw "not-in-progress";
  const { handle } = socket;
  const server = new Server({ pauseOnConnect: true, allowHalfOpen: true });
  return new Promise((resolve, reject) => {
    function handleErr(err) {
      server.off("listening", handleListen);
      socket.state = SOCKET_STATE_ERROR;
      reject(err);
    }
    function handleListen() {
      server.off("error", handleErr);
      server.on("connection", (tcpSocket) => {
        process._rawDebug(">>> GOT CONNECTION FOR ACCEPT");
        tcpSocket.on('ready', () => {
          process._rawDebug('--- TCP READY ---');
        })
        tcpSocket.on('end', () => {
          process._rawDebug(' --- TCP END --- ');
        });
        tcpSocket.on('close', () => {
          process._rawDebug(' --- TCP CLOSE --- ');
        });
        tcpSocket.on('error', () => {
          process._rawDebug(' --- TCP ERROR --- ');
        });
        tcpSocket.on('readable', () => {
          process._rawDebug(' --- TCP READABLE --- ');
        });
        socket.pendingAccepts.push({ tcpSocket, err: null });
      });
      server.on("error", (err) => {
        socket.pendingAccepts.push({ tcpSocket: null, err });
      });
      socket.state = SOCKET_STATE_LISTENER;
      resolve();
    }
    server.once("listening", handleListen);
    server.once("error", handleErr);
    server.listen(handle, backlogSize);
  });
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
