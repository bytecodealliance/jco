import { createSocket } from "node:dgram";
import {
  createFuture,
  futureDispose,
  futureTakeValue,
  // pollStateReady,
  // verifyPollsDroppedForDrop,
} from "./worker-thread.js";
import {
  convertSocketError,
  convertSocketErrorCode,
  deserializeIpAddress,
  isIPv4MappedAddress,
  isWildcardAddress,
  noLookup,
  serializeIpAddress,
  SOCKET_STATE_BIND,
  SOCKET_STATE_BOUND,
  SOCKET_STATE_CLOSED,
  SOCKET_STATE_CONNECTION,
  SOCKET_STATE_INIT,
} from "./worker-sockets.js";

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 *
 *
 * @typedef {{
 *   state: number
 *   udpSocket: import('node:dgram').Socket,
 *   future: number | null,
 *   serializedLocalAddress: string | null,
 *   pollState: PollState,
 *   incomingDatagramStream: number | null,
 *   outgoingDatagramStream: number | null,
 * }} UdpSocketRecord
 *
 * @typedef {{
 *   pollState: PollState,
 * }} IncomingDatagramStreamRecord
 *
 * @typedef {{
 *   pollState: PollState,
 * }} OutgoingDatagramStreamRecord
 *
 */

let udpSocketCnt = 0,
  incomingDatagramStreamCnt,
  outgoingDatagramStreamCnt;

/**
 * @type {Map<number, UdpSocketRecord>}
 */
export const udpSockets = new Map();

/**
 * @type {Map<number, IncomingDatagramStreamRecord>}
 */
export const incomingDatagramStreams = new Map();

/**
 * @type {Map<number, OutgoingDatagramStreamRecord>}
 */
export const outgoingDatagramStreams = new Map();

/**
 * @param {IpAddressFamily} addressFamily
 * @returns {number}
 */
export function createUdpSocket(family) {
  const udpSocket = createSocket({
    type: family === "ipv6" ? "udp6" : "udp4",
    reuseAddr: false,
    ipv6Only: family === "ipv6",
    lookup: noLookup,
  });
  udpSockets.set(++udpSocketCnt, {
    state: SOCKET_STATE_INIT,
    udpSocket,
    future: null,
    serializedLocalAddress: null,
    pollState: { ready: true, listener: null, polls: [], parentStream: null },
    incomingDatagramStream: null,
    outgoingDatagramStream: null,
  });
  return udpSocketCnt;
}

function createIncomingDatagramStream(_udpSocket) {
  incomingDatagramStreams.set(incomingDatagramStreamCnt++, {
    pollState: { ready: true, listener: null, polls: [], parentStream: null },
  });
  return incomingDatagramStreamCnt;
}

function createOutgoingDatagramStream(_udpSocket) {
  outgoingDatagramStreams.set(outgoingDatagramStreamCnt++, {
    pollState: { ready: true, listener: null, polls: [], parentStream: null },
  });
  return incomingDatagramStreamCnt;
}

export function socketUdpBindStart(id, localAddress, family) {
  const socket = udpSockets.get(id);

  if (family !== localAddress.tag || isIPv4MappedAddress(localAddress))
    throw "invalid-argument";

  const serializedLocalAddress = serializeIpAddress(localAddress);

  if (socket.state !== SOCKET_STATE_INIT) throw "invalid-state";
  socket.state = SOCKET_STATE_BIND;
  const { udpSocket } = socket;
  socket.future = createFuture(
    new Promise((resolve, reject) => {
      function bindOk() {
        resolve();
        udpSocket.off("error", bindErr);
      }
      function bindErr(err) {
        reject(convertSocketError(err));
        udpSocket.off("listening", bindOk);
      }
      udpSocket.once("listening", bindOk);
      udpSocket.once("error", bindErr);
      udpSocket.bind(localAddress.val.port, serializedLocalAddress);
    }),
    socket.pollState
  );
}

export function socketUdpBindFinish(
  id,
  { unicastHopLimit, receiveBufferSize, sendBufferSize }
) {
  const socket = udpSockets.get(id);
  if (socket.state !== SOCKET_STATE_BIND) throw "not-in-progress";
  if (!socket.pollState.ready) throw "would-block";
  const { tag, val } = futureTakeValue(socket.future).val;
  futureDispose(socket.future, false);
  socket.future = null;
  if (tag === "err") {
    socket.state = SOCKET_STATE_CLOSED;
    throw val;
  } else {
    // once bound, we can now set the options
    // since Node.js doesn't support setting them until bound
    socket.udpSocket.setTTL(unicastHopLimit);
    socket.udpSocket.setRecvBufferSize(Number(receiveBufferSize));
    socket.udpSocket.setSendBufferSize(Number(sendBufferSize));
    socket.state = SOCKET_STATE_BOUND;
    return val;
  }
}

/**
 * @param {number} id
 * @returns {IpSocketAddress}
 */
export function socketUdpGetLocalAddress(id) {
  const { udpSocket } = udpSockets.get(id);
  let address, family, port;
  try {
    ({ address, family, port } = udpSocket.address());
  } catch (err) {
    throw convertSocketError(err);
  }
  family = family.toLowerCase();
  return {
    tag: family,
    val: {
      port,
      flowInfo: 0,
      address: deserializeIpAddress(address, family),
      scopeId: 0,
    },
  };
}

/**
 * @param {number} id
 * @returns {IpSocketAddress}
 */
export function socketUdpGetRemoteAddress(id) {
  const { udpSocket } = udpSockets.get(id);
  let address, family, port;
  try {
    ({ address, family, port } = udpSocket.remoteAddress());
  } catch (err) {
    throw convertSocketError(err);
  }
  family = family.toLowerCase();
  return {
    tag: family,
    val: {
      port,
      flowInfo: 0,
      address: deserializeIpAddress(address, family),
      scopeId: 0,
    },
  };
}

export function socketUdpStream(id, remoteAddress) {
  const socket = udpSockets.get(id);
  const { udpSocket } = socket;

  if (
    socket.state !== SOCKET_STATE_BOUND &&
    socket.state !== SOCKET_STATE_CONNECTION
  )
    throw "invalid-state";

  if (
    remoteAddress &&
    (remoteAddress.val.port === 0 ||
      isWildcardAddress(remoteAddress) ||
      (remoteAddress.tag === "ipv6" && isIPv4MappedAddress(remoteAddress)))
  )
    throw "invalid-argument";

  if (socket.state === SOCKET_STATE_CONNECTION) {
    socketIncomingDatagramStreamDispose(socket.incomingDatagramStream);
    socketOutgoingDatagramStreamDispose(socket.outgoingDatagramStream);
    try {
      udpSocket.disconnect();
    } catch (e) {
      throw convertSocketErrorCode(e);
    }
  }

  if (remoteAddress) {
    return new Promise((resolve, reject) => {
      function connectOk() {
        udpSocket.off("error", connectErr);
        socket.state = SOCKET_STATE_CONNECTION;
        resolve([
          (socket.incomingDatagramStream =
            createIncomingDatagramStream(udpSocket)),
          (socket.outgoingDatagramStream =
            createOutgoingDatagramStream(udpSocket)),
        ]);
      }
      function connectErr(err) {
        udpSocket.off("connect", connectOk);
        reject(convertSocketError(err));
      }

      udpSocket.once("connect", connectOk);
      udpSocket.once("error", connectErr);

      udpSocket.connect(
        remoteAddress?.val.port ?? 1,
        remoteAddress ? serializeIpAddress(remoteAddress) : undefined
      );
    });
  } else {
    socket.state = SOCKET_STATE_BOUND;
    return [
      (socket.incomingDatagramStream = createIncomingDatagramStream(udpSocket)),
      (socket.outgoingDatagramStream = createOutgoingDatagramStream(udpSocket)),
    ];
  }
}

// udpSocket.on("message", (data, rinfo) => {
//   const remoteSocket = getUdpSocketByPort(rinfo.port);
//   let { address, port } = udpSocket.address();

//   if (remoteSocket[symbolSocketUdpIpUnspecified].isUnspecified) {
//     // cache original bound address
//     rinfo._address =
//       remoteSocket[symbolSocketUdpIpUnspecified].localAddress;
//   }

//   const receiverSocket = {
//     address,
//     port,
//     id,
//   };

//   enqueueReceivedSocketDatagram(receiverSocket, { data, rinfo });
// });

// // catch all errors
// udpSocket.once("error", (err) => {
//   resolve(err.errno);
// });

// if (!err) {
//       // this.#options.connectionState = SocketConnectionState.Connected;
//     } else {
//       if (err === -22) throw "invalid-argument";
//       throw "unknown";
//     }
//   }
// }

export function socketUdpDispose(id) {
  const { udpSocket } = udpSockets.get(id);
  return new Promise((resolve) => {
    udpSocket.close(() => {
      udpSockets.delete(id);
      resolve(0);
    });
  });
}

export function socketIncomingDatagramStreamReceive(id, maxResults) {
  // eslint-disable-next-line
  const incomingDatagramStream = incomingDatagramStreams.get(id);
  if (maxResults === 0n) return [];
  // patch up local addres on received dgram
  throw new Error("TODO");
}

export function socketOutgoingDatagramStreamSend(id, _datagrams) {
  // eslint-disable-next-line
  const outgoingDatagramStream = outgoingDatagramStreams.get(id);
  return BigInt(24);
}

export function socketOutgoingDatagramStreamCheckSend(id) {
  // eslint-disable-next-line
  const outgoingDatagramStream = outgoingDatagramStreams.get(id);
  return BigInt(24);
}

export function socketIncomingDatagramStreamDispose(id) {
  // eslint-disable-next-line
  const outgoingDatagramStream = outgoingDatagramStreams.get(id);
}

export function socketOutgoingDatagramStreamDispose(id) {
  // eslint-disable-next-line
  const incomingDatagramStream = incomingDatagramStreams.get(id);
}

// if (datagrams.length === 0) {
//   return 0n;
// }

// let datagramsSent = 0n;

// for (const datagram of datagrams) {
//   const { data, remoteAddress } = datagram;
//   const remotePort = remoteAddress?.val?.port || undefined;
//   const host = serializeIpAddress(remoteAddress);

//   if (this.checkSend() < data.length) throw "datagram-too-large";
//   // TODO: add the other assertions

//   const ret = ioCall(
//     SOCKET_UDP_SEND,
//     this.#id, // socket that's sending the datagrams
//     {
//       data,
//       remotePort,
//       remoteHost: host,
//     }
//   );
//   if (ret === 0) {
//     datagramsSent++;
//   } else {
//     if (ret === -65) throw "remote-unreachable";
//   }
// }

// return datagramsSent;
// return ioCall(SOCKET_OUTGOING_DATAGRAM_STREAM_SEND, this.#id)

// /**
//  * @type {Map<number, Map<string, { data: Buffer, rinfo: { address: string, family: string, port: number, size: number } }>>}
//  */
// const queuedReceivedSocketDatagrams = new Map();

// function getUdpSocketByPort(port) {
//   return Array.from(udpSockets.values()).find(
//     (socket) => socket.address().port === port
//   );
// }

// function getBoundUdpSockets(socketId) {
//   return Array.from(udpSockets.entries())
//     .filter(([id, _socket]) => id !== socketId) // exclude source socket
//     .map(([_id, socket]) => socket.address());
// }

// function dequeueReceivedSocketDatagram(socketInfo, maxResults) {
//   const key = `PORT:${socketInfo.port}`;
//   const dgrams = queuedReceivedSocketDatagrams
//     .get(key)
//     .splice(0, Number(maxResults));
//   return dgrams;
// }
// function enqueueReceivedSocketDatagram(socketInfo, { data, rinfo }) {
//   const key = `PORT:${socketInfo.port}`;
//   const chunk = {
//     data,
//     rinfo, // sender/remote socket info (source)
//     socketInfo, // receiver socket info (targeted socket)
//   };

//   // create new queue if not exists
//   if (!queuedReceivedSocketDatagrams.has(key)) {
//     queuedReceivedSocketDatagrams.set(key, []);
//   }

//   // append to queue
//   const queue = queuedReceivedSocketDatagrams.get(key);
//   queue.push(chunk);
// }

// //-----------------------------------------------------

// export function socketUdpCheckSend(id) {
//   const socket = udpSockets.get(id);
//   try {
//     return socket.getSendBufferSize() - socket.getSendQueueSize();
//   } catch (err) {
//     return err.errno;
//   }
// }

// export function socketUdpSend(id, payload) {
//   let { remoteHost, remotePort, data } = payload;
//   const socket = udpSockets.get(id);

//   return new Promise((resolve) => {
//     const _callback = (err, _byteLength) => {
//       if (err) return resolve(err.errno);
//       resolve(0); // success
//     };

//     // Note: when remoteHost/remotePort is None, we broadcast to all bound sockets
//     // except the source socket
//     if (remotePort === undefined || remoteHost === undefined) {
//       getBoundUdpSockets(id).forEach((adr) => {
//         socket.send(data, adr.port, adr.address, _callback);
//       });
//     } else {
//       socket.send(data, remotePort, remoteHost, _callback);
//     }

//     socket.once("error", (err) => {
//       resolve(err.errno);
//     });
//   });
// }

// export function SocketUdpReceive(id, payload) {
//   const { maxResults } = payload;
//   const socket = udpSockets.get(id);
//   const { address, port } = socket.address();

//   // set target socket info
//   // we use this to filter out datagrams that are were sent to this socket
//   const targetSocket = {
//     address,
//     port,
//   };

//   const dgrams = dequeueReceivedSocketDatagram(targetSocket, maxResults);
//   return Promise.resolve(dgrams);
// }

// const ipUnspecified =
// serializedLocalAddress === "0.0.0.0" ||
// serializedLocalAddress === "0:0:0:0:0:0:0:0";

// // Note: even if the client has bound to IPV4_UNSPECIFIED/IPV6_UNSPECIFIED (0.0.0.0 // ::),
// // rinfo.address is resolved to IPV4_LOOPBACK/IPV6_LOOPBACK.
// // We need to cache the original bound IP type and fix rinfo.address when receiving datagrams (see below)
// // See https://github.com/WebAssembly/wasi-sockets/issues/86
// socket[symbolSocketUdpIpUnspecified] = {
// isUnspecified: ipUnspecified,
// serializedAddress: serializedLocalAddress,
// };
