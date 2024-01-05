import { createStream, createPoll } from "./worker-thread.js";
// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const { TCP, constants: TCPConstants } = process.binding("tcp_wrap");
import {
  deserializeIpAddress,
  serializeIpAddress,
} from "../nodejs/sockets/socket-common.js";
import { convertSocketErrorCode } from "./worker-sockets.js";
import { Socket } from "node:net";

const noop = () => {};

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 */

/**
 * @type {Map<number, {
 *  subscribePromise: null | Promise<void>,
 *  subscribeResolve: null | () => {},
 *  handle: TCP,
 *  socket: NodeJS.Socket
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
    socket: null,
    subscribePromise: null,
    subscribeResolve: null,
  });
  return tcpSocketCnt;
}

export function socketTcpSubscribe(id) {
  const socket = getTcpSocketOrThrow(id);
  if (socket.subscribePromise) {
    if (socket.subscribeResolve === noop)
      return 0;
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
  if (!tcpSocket.socket)
    tcpSocket.socket = new Socket({ handle: tcpSocket.handle, pauseOnCreate: true });
  const { socket } = tcpSocket;
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

export function socketTcpListen(id, backlogSize) {
  const socket = getTcpSocketOrThrow(id);
  // todo: error handling?
  return socket.listen(backlogSize);
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
  if (socket.socket)
    socket.socket.end();
}

export function socketTcpSetKeepAlive(id, enable) {
  const { handle } = getTcpSocketOrThrow(id);
  const code = handle.setKeepAlive(enable);
  if (code !== 0) throw convertSocketErrorCode(-code);
}

export function socketTcpDispose(id) {
  openTcpSockets.delete(id);
}
