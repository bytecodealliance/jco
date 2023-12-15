/*
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 */
import { createSocket } from "node:dgram";

const symbolSocketUdpIpUnspecified =
  Symbol.symbolSocketUdpIpUnspecified ??
  Symbol.for("symbolSocketUdpIpUnspecified");

/** @type {Map<number, NodeJS.Socket>} */
export const openedSockets = new Map();

/** @type {Map<number, Map<string, { data: Buffer, rinfo: { address: string, family: string, port: number, size: number } }>>} */
const queuedReceivedSocketDatagrams = new Map();

let socketCnt = 0;

export function getSocketOrThrow(socketId) {
  const socket = openedSockets.get(socketId);
  if (!socket) throw "invalid-state";
  return socket;
}

export function getSocketByPort(port) {
  return Array.from(openedSockets.values()).find(
    (socket) => socket.address().port === port
  );
}

export function getBoundSockets(socketId) {
  return Array.from(openedSockets.entries())
    .filter(([id, _socket]) => id !== socketId) // exclude source socket
    .map(([_id, socket]) => socket.address());
}

export function dequeueReceivedSocketDatagram(socketInfo, maxResults) {
  const key = `PORT:${socketInfo.port}`;
  const dgrams = queuedReceivedSocketDatagrams
    .get(key)
    .splice(0, Number(maxResults));
  return dgrams;
}
export function enqueueReceivedSocketDatagram(socketInfo, { data, rinfo }) {
  const key = `PORT:${socketInfo.port}`;
  const chunk = {
    data,
    rinfo, // sender/remote socket info (source)
    socketInfo, // receiver socket info (targeted socket)
  };

  // create new queue if not exists
  if (!queuedReceivedSocketDatagrams.has(key)) {
    queuedReceivedSocketDatagrams.set(key, []);
  }

  // append to queue
  const queue = queuedReceivedSocketDatagrams.get(key);
  queue.push(chunk);
}

//-----------------------------------------------------

/**
 * @param {IpAddressFamily} addressFamily
 * @returns {NodeJS.Socket}
 */
export function createUdpSocket(addressFamily, reuseAddr) {
  return new Promise((resolve, reject) => {
    const type = addressFamily === "ipv6" ? "udp6" : "udp4";
    try {
      const socket = createSocket({
        type,
        reuseAddr,
      });
      openedSockets.set(++socketCnt, socket);
      resolve({
        id: socketCnt,
        socket,
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function socketUdpBind(id, payload) {
  const { localAddress, localPort } = payload;
  const socket = getSocketOrThrow(id);

  // Note: even if the client has bound to IPV4_UNSPECIFIED/IPV6_UNSPECIFIED (0.0.0.0 // ::),
  // rinfo.address is resolved to IPV4_LOOPBACK/IPV6_LOOPBACK.
  // We need to cache the original bound IP type and fix rinfo.address when receiving datagrams (see below)
  // See https://github.com/WebAssembly/wasi-sockets/issues/86
  socket[symbolSocketUdpIpUnspecified] = {
    isUnspecified:
      localAddress === "0.0.0.0" || localAddress === "0:0:0:0:0:0:0:0",
    localAddress,
  };

  return new Promise((resolve) => {
    socket.bind(
      {
        address: localAddress,
        port: localPort,
      },
      () => {
        openedSockets.set(id, socket);
        resolve(0);
      }
    );

    socket.on("message", (data, rinfo) => {
      const remoteSocket = getSocketByPort(rinfo.port);
      let { address, port } = socket.address();

      if (remoteSocket[symbolSocketUdpIpUnspecified].isUnspecified) {
        // cache original bound address
        rinfo._address =
          remoteSocket[symbolSocketUdpIpUnspecified].localAddress;
      }

      const receiverSocket = {
        address,
        port,
        id,
      };

      enqueueReceivedSocketDatagram(receiverSocket, { data, rinfo });
    });

    // catch all errors
    socket.once("error", (err) => {
      resolve(err.errno);
    });
  });
}

export function socketUdpCheckSend(id) {
  const socket = getSocketOrThrow(id);
  try {
    return socket.getSendBufferSize() - socket.getSendQueueSize();
  } catch (err) {
    return err.errno;
  }
}

export function socketUdpSend(id, payload) {
  let { remoteHost, remotePort, data } = payload;
  const socket = getSocketOrThrow(id);

  return new Promise((resolve) => {
    const _callback = (err, _byteLength) => {
      if (err) return resolve(err.errno);
      resolve(0); // success
    };

    // Note: when remoteHost/remotePort is None, we broadcast to all bound sockets
    // except the source socket
    if (remotePort === undefined || remoteHost === undefined) {
      getBoundSockets(id).forEach((adr) => {
        socket.send(data, adr.port, adr.address, _callback);
      });
    } else {
      socket.send(data, remotePort, remoteHost, _callback);
    }

    socket.once("error", (err) => {
      resolve(err.errno);
    });
  });
}

export function SocketUdpReceive(id, payload) {
  const { maxResults } = payload;
  const socket = getSocketOrThrow(id);
  const { address, port } = socket.address();

  // set target socket info
  // we use this to filter out datagrams that are were sent to this socket
  const targetSocket = {
    address,
    port,
  };

  const dgrams = dequeueReceivedSocketDatagram(targetSocket, maxResults);
  return Promise.resolve(dgrams);
}

export function socketUdpConnect(id, payload) {
  const socket = getSocketOrThrow(id);
  const { remoteAddress, remotePort } = payload;
  return new Promise((resolve) => {
    socket.connect(remotePort, remoteAddress, () => {
      openedSockets.set(id, socket);
      resolve(0);
    });
    socket.once("error", (err) => {
      resolve(err.errno);
    });
  });
}

export function socketUdpDisconnect(id) {
  const socket = getSocketOrThrow(id);
  return new Promise((resolve) => {
    socket.disconnect();
    resolve(0);
  });
}

export function socketUdpDispose(id) {
  const socket = getSocketOrThrow(id);
  return new Promise((resolve) => {
    socket.close(() => {
      openedSockets.delete(id);
      resolve(0);
    });
  });
}
