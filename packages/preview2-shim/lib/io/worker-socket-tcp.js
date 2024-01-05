/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 */

// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const {
  TCP,
  constants: TCPConstants,
  TCPConnectWrap,
} = process.binding("tcp_wrap");
const { ShutdownWrap } = process.binding("stream_wrap");
import {
  deserializeIpAddress,
  serializeIpAddress,
} from "../nodejs/sockets/socket-common.js";
import { } from "node:constants";
import { convertSocketErrorCode } from "./worker-sockets.js";

/** @type {Map<number, NodeJS.Socket>} */
export const openTcpSockets = new Map();

let tcpSocketCnt = 0;

export function getSocketOrThrow(socketId) {
  const socket = openTcpSockets.get(socketId);
  if (!socket) throw "invalid-socket";
  return socket;
}

//-----------------------------------------------------

/**
 * @param {IpAddressFamily} addressFamily
 * @returns {NodeJS.Socket}
 */
export function createTcpSocket() {
  const socket = new TCP(TCPConstants.SOCKET | TCPConstants.SERVER);
  openTcpSockets.set(++tcpSocketCnt, socket);
  return tcpSocketCnt;
}

/**
 *
 * @param {number} id
 * @param {{ localAddress: IpSocketAddress, family: IpAddressFamily, isIpV6Only: boolean }} options
 * @returns
 */
export function socketTcpBind(id, { localAddress, isIpV6Only }) {
  const socket = getSocketOrThrow(id);
  const address = serializeIpAddress(localAddress, false);
  const port = localAddress.val.port;
  let code;
  if (localAddress.tag === "ipv6")
    code = socket.bind6(
      address,
      port,
      isIpV6Only ? TCPConstants.UV_TCP_IPV6ONLY : 0
    );
  else
    code = socket.bind(address, port);
  if (code !== 0)
    throw convertSocketErrorCode(-code);
}

export function socketTcpConnect(id, { remoteAddress, localAddress }) {
  const socket = getSocketOrThrow(id);
  const connectReq = new TCPConnectWrap();
  const address = serializeIpAddress(remoteAddress, false);
  const port = remoteAddress.val.port;
  const [localAddr, localPort] = localAddress.split(':');
  process._rawDebug(':::::', localAddr, localPort);
  connectReq.address = address;
  connectReq.port = port;
  connectReq.localAddress = localAddr;
  connectReq.localPort = Number(localPort);
  connectReq.addressType = remoteAddress.tag === 'ipv6' ? 6 : 4;
  return new Promise((resolve, reject) => {
    const _onClientConnectComplete = (err) => {
      process._rawDebug('connect compete');
      if (err) {
        // err number is negative
        return reject(convertSocketErrorCode(-err));
      }
      resolve(123);
    };
    connectReq.oncomplete = _onClientConnectComplete;
    // socket.onread = (_buffer) => {
    //   // TODO: handle data received from the server
    // };
    // socket.readStart();
    let code;
    if (remoteAddress.tag === "ipv6") {
      code = socket.connect6(connectReq, address, port);
    }
    code = socket.connect(connectReq, address, port);
    process._rawDebug(connectReq, address, port, '->', code);
    return reject(convertSocketErrorCode(-code));
  });
}

export function socketTcpListen(id, backlogSize) {
  const socket = getSocketOrThrow(id);
  // todo: error handling?
  return socket.listen(backlogSize);
}

export function socketTcpGetLocalAddress(id) {
  const socket = getSocketOrThrow(id);
  const out = {};
  try {
    socket.getsockname(out);
  } catch (err) {
    process._rawDebug(err);
    throw "unknown";
  }
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
  const socket = getSocketOrThrow(id);
  const out = {};
  socket.getpeername(out);
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
  const socket = getSocketOrThrow(id);

  return new Promise((resolve) => {
    const req = new ShutdownWrap();
    req.oncomplete = () => {
      resolve(0);
    };
    req.handle = socket;
    req.callback = () => {
      resolve(0);
    };
    const err = socket.shutdown(req);
    resolve(err);
  });
}

export function socketTcpSetKeepAlive(id, enable) {
  const socket = getSocketOrThrow(id);
  return socket.setKeepAlive(enable);
}

export function socketTcpDispose(id) {
  const socket = getSocketOrThrow(id);
  socket.close();
  return 0;
}
