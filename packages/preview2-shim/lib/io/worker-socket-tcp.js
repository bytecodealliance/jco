import { createStream, createPoll } from "./worker-thread.js";
// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const { TCP, constants: TCPConstants } = process.binding("tcp_wrap");
import {
  deserializeIpAddress,
  serializeIpAddress,
} from "../nodejs/sockets/socket-common.js";
import { convertSocketError, convertSocketErrorCode } from "./worker-sockets.js";
import { Socket, Server } from "node:net";

const noop = () => {};

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 *
 * @typedef {{
 *   next: PendingAccept | null,
 *   err: Error | null,
 *   socket: number | null
 * }} PendingAccept
 */

/**
 * @type {Map<number, {
 *  subscribePromise: null | Promise<void>,
 *  subscribeResolve: null | () => {},
 *  handle: TCP,
 *  pendingAccept: PendingAccept | null,
 *  lastPendingAccept: PendingAccept | null,
 *  acceptPromise: null | Promise<void>,
 * }>}
 */
export const openTcpSockets = new Map();

let tcpSocketCnt = 0;

export function getTcpSocketOrThrow(socketId) {
  const tcpSocket = openTcpSockets.get(socketId);
  if (!tcpSocket) throw new Error("internal error: socket not found");
  return tcpSocket;
}

/**
 * @param {IpAddressFamily} addressFamily
 */
export function createTcpSocket() {
  const handle = new TCP(TCPConstants.SOCKET);
  openTcpSockets.set(++tcpSocketCnt, {
    handle,
    subscribePromise: null,
    subscribeResolve: null,
    pendingAccept: null,
    lastPendingAccept: null,
    acceptListener: null,
  });
  return tcpSocketCnt;
}

export function socketTcpSubscribe(id) {
  const socket = getTcpSocketOrThrow(id);
  if (socket.subscribePromise) {
    if (socket.subscribeResolve === noop) return 0;
    return createPoll(socket.subscribePromise);
  }
  return createPoll(
    (socket.subscribePromise = new Promise(
      (resolve) => void (socket.subscribeResolve = resolve)
    ))
  );
}

/**
 *
 * @param {number} id
 * @param {{ localAddress: IpSocketAddress, family: IpAddressFamily, isIpV6Only: boolean }} options
 * @returns
 */
export function socketTcpBind(id, { localAddress, isIpV6Only }) {
  const { handle } = getTcpSocketOrThrow(id);
  const address = serializeIpAddress(localAddress, false);
  const port = localAddress.val.port;
  const code =
    localAddress.tag === "ipv6"
      ? handle.bind6(
          address,
          port,
          isIpV6Only ? TCPConstants.UV_TCP_IPV6ONLY : 0
        )
      : handle.bind(address, port);
  if (code !== 0) throw convertSocketErrorCode(-code);
}

export function socketTcpConnect(id, remoteAddress) {
  const tcpSocket = getTcpSocketOrThrow(id);
  const socket = new Socket({ handle: tcpSocket.handle, pauseOnCreate: true });
  return new Promise((resolve, reject) => {
    function handleErr(err) {
      socket.off("connect", handleConnect);
      reject(err);
    }
    function handleConnect() {
      socket.off("error", handleErr);
      if (tcpSocket.subscribeResolve) {
        tcpSocket.subscribeResolve();
        tcpSocket.subscribeResolve = noop;
      }
      resolve([createStream(socket), createStream(socket)]);
    }
    socket.once("connect", handleConnect);
    socket.once("error", handleErr);
    socket.connect({
      port: remoteAddress.val.port,
      host: serializeIpAddress(remoteAddress, false),
      lookup: () => {
        throw "invalid-argument";
      },
    });
  });
}

export function socketTcpAccept(id) {
  const tcpSocket = getTcpSocketOrThrow(id);
  if (tcpSocket.pendingAccept) {
    const accept = tcpSocket.pendingAccept;
    if (accept.next) {
      tcpSocket.pendingAccept = accept.next;
    } else {
      tcpSocket.pendingAccept = tcpSocket.lastPendingAccept = null;
    }
    if (accept.err)
      throw convertSocketError(accept.err);
    
    openTcpSockets.set(++tcpSocketCnt, {
      handle: accept.socket._handle,
      subscribePromise: null,
      subscribeResolve: null,
      pendingAccept: null,
      lastPendingAccept: null,
      acceptListener: null
    });
    return [createStream(accept.socket), createStream(accept.socket), tcpSocketCnt];
  }
  return new Promise((resolve, reject) => {
    tcpSocket.acceptListener = (err, socket) => {
      tcpSocket.acceptListener = null;
      if (err) return reject(convertSocketError(err));
      openTcpSockets.set(++tcpSocketCnt, {
        handle: socket._handle,
        subscribePromise: null,
        subscribeResolve: null,
        pendingAccept: null,
        lastPendingAccept: null,
        acceptListener: null
      });
      resolve([createStream(socket), createStream(socket), tcpSocketCnt]);
    };
  });
}

export function socketTcpListen(id, backlogSize) {
  const tcpSocket = getTcpSocketOrThrow(id);
  const { handle } = tcpSocket;
  const server = new Server();
  return new Promise((resolve, reject) => {
    function handleErr(err) {
      server.off("listening", handleListen);
      reject(err);
    }
    function handleListen() {
      server.off("error", handleErr);
      if (tcpSocket.subscribeResolve) {
        tcpSocket.subscribeResolve();
        tcpSocket.subscribeResolve = noop;
      }

      server.on("connection", (socket) => {
        if (tcpSocket.acceptListener)
          return tcpSocket.acceptListener(null, socket);
        const pendingAccept = {
          next: null,
          err: null,
          socket,
        };
        if (tcpSocket.lastPendingAccept)
          tcpSocket.lastPendingAccept.next = pendingAccept;
        else tcpSocket.pendingAccept = pendingAccept;
        tcpSocket.lastPendingAccept = pendingAccept;
      });
      server.on("error", (err) => {
        if (tcpSocket.acceptListener)
          return tcpSocket.acceptListener(err, null);
        const pendingAccept = {
          next: null,
          err,
          socket: null,
        };
        if (tcpSocket.lastPendingAccept)
          tcpSocket.lastPendingAccept.next = pendingAccept;
        else tcpSocket.pendingAccept = pendingAccept;
        tcpSocket.lastPendingAccept = pendingAccept;
      });
      resolve();
    }
    server.once("listening", handleListen);
    server.once("error", handleErr);
    server.listen(handle, backlogSize);
  });
}

export function socketTcpGetLocalAddress(id) {
  const { handle } = getTcpSocketOrThrow(id);
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
  const { handle } = getTcpSocketOrThrow(id);
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

export function socketTcpShutdown(id, _shutdownType) {
  const socket = getTcpSocketOrThrow(id);
  if (socket.socket) socket.socket.end();
}

export function socketTcpSetKeepAlive(id, enable) {
  const { handle } = getTcpSocketOrThrow(id);
  const code = handle.setKeepAlive(enable);
  if (code !== 0) throw convertSocketErrorCode(-code);
}

export function socketTcpDispose(id) {
  openTcpSockets.delete(id);
}
