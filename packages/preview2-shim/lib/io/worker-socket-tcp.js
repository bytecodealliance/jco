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
export function socketTcpBind(id, { localAddress, family, isIpV6Only }) {
  const socket = getSocketOrThrow(id);
  const address = serializeIpAddress(localAddress, false);
  const port = localAddress.val.port;
  if (family === "ipv6")
    return socket.bind6(
      address,
      port,
      isIpV6Only ? TCPConstants.UV_TCP_IPV6ONLY : 0
    );
  return socket.bind(address, port, 0);
}

export function socketTcpConnect(id, payload) {
  const socket = getSocketOrThrow(id);
  const { remoteAddress, remotePort, localAddress, localPort, family } =
    payload;

  return new Promise((resolve) => {
    const _onClientConnectComplete = (err) => {
      if (err) resolve(err);
      resolve(0);
    };
    const connectReq = new TCPConnectWrap();
    connectReq.oncomplete = _onClientConnectComplete;
    connectReq.address = remoteAddress;
    connectReq.port = remotePort;
    connectReq.localAddress = localAddress;
    connectReq.localPort = localPort;
    let connect = "connect"; // ipv4
    if (family === "ipv6") {
      connect = "connect6";
    }
    socket.onread = (_buffer) => {
      // TODO: handle data received from the server
    };
    socket.readStart();

    const err = socket[connect](connectReq, remoteAddress, remotePort);
    resolve(err);
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
