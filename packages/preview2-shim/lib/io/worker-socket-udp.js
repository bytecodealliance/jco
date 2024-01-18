import { createSocket } from "node:dgram";
import {
  createFuture,
  futureDispose,
  futureTakeValue,
  // pollStateReady,
  // verifyPollsDroppedForDrop,
} from "./worker-thread.js";
import {
  SOCKET_STATE_INIT,
  SOCKET_STATE_BIND,
  SOCKET_STATE_BOUND,
  SOCKET_STATE_CONNECTION,
  SOCKET_STATE_CLOSED,
  convertSocketError,
  convertSocketErrorCode,
} from "./worker-sockets.js";
import { serializeIpAddress, isIPv4MappedAddress, deserializeIpAddress } from "./socket-common.js";

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

let udpSocketCnt = 0;
  // incomingDatagramStreamCnt,
  // outgoingDatagramStreamCount;

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

function noLookup (ip, _opts, cb) {
  cb(null, ip);
}

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
      scopeId: 0
    }
  };
}

/**
 * @param {number} id
 * @returns {IpSocketAddress}
 */
export function socketUdpGetRemoteAddress(id) {
  const { state, udpSocket } = udpSockets.get(id);
  if (state === SOCKET_STATE_BOUND)
    throw 'invalid-state';
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
      scopeId: 0
    }
  };
}

export function socketUdpStream(id, remoteAddress) {
  const socket = udpSockets.get(id);
  const { udpSocket } = socket;

  if (socket.state !== SOCKET_STATE_BOUND && socket.state !== SOCKET_STATE_CONNECTION)
    throw 'invalid-state';

  if (remoteAddress && remoteAddress.val.port === 0)
    throw 'invalid-argument';

  // stream() can be called multiple times, so we need to disconnect first if we are already connected
  // Note: disconnect() will also reset the connection state but does not close the socket handle!
  if (socket.state === SOCKET_STATE_CONNECTION) {
    socketIncomingDatagramStreamDispose(socket.incomingDatagramStream);
    socketOutgoingDatagramStreamDispose(socket.outgoingDatagramStream);
    try {
      udpSocket.disconnect();
    } catch (e) {
      throw convertSocketErrorCode(e);
    }
  }

  function connectOk () {
    udpSocket.off('error', connectErr);
  }
  function connectErr () {
    udpSocket.off('connection', connectOk);
  }

  udpSocket.once('connection', connectOk);
  udpSocket.once('error', connectErr);
  udpSocket.connect(remoteAddress?.val.port ?? 1, remoteAddress ? serializeIpAddress(remoteAddress) : undefined);

  return [
    socket.incomingDatagramStream = 0,
    socket.outgoingDatagramStream = 0
  ];
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

export function socketIncomingDatagramStreamReceive(_id, _maxResults) {
  throw new Error("TODO");
}

export function socketOutgoingDatagramStreamSend(_id, _datagrams) {
  throw new Error("TODO");
}

export function socketOutgoingDatagramStreamCheckSend(_id) {
  throw new Error("TODO");
}

export function socketIncomingDatagramStreamDispose(_id) {

}

export function socketOutgoingDatagramStreamDispose(_id) {
}

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
