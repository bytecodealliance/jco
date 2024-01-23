import { createSocket } from "node:dgram";
import {
  createFuture,
  futureDispose,
  futureTakeValue,
  pollStateReady,
  verifyPollsDroppedForDrop,
} from "./worker-thread.js";
import {
  convertSocketError,
  convertSocketErrorCode,
  getDefaultReceiveBufferSize,
  getDefaultSendBufferSize,
  ipSocketAddress,
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

// Experimental support for batched UDP sends. Set this to true to enable.
// This is not enabled by default because we need to figure out how to know
// how many datagrams were sent when there is an error in a batch.
// See the err path in "handler" in the "doSendBatch" of socketOutgoingDatagramStreamSend.
const UDP_BATCH_SENDS = false;

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 *
 *
 * @typedef {{
 *   state: number,
 *   remoteAddress: string | null,
 *   remotePort: number | null,
 *   sendBufferSize: number | null,
 *   receiveBufferSize: number | null,
 *   unicastHopLimit: number,
 *   udpSocket: import('node:dgram').Socket,
 *   future: number | null,
 *   serializedLocalAddress: string | null,
 *   pollState: PollState,
 *   incomingDatagramStream: number | null,
 *   outgoingDatagramStream: number | null,
 * }} UdpSocketRecord
 *
 * @typedef {{
 *   active: bool,
 *   error: any | null,
 *   socket: UdpSocketRecord,
 *   pollState: PollState,
 *   queue?: Buffer[],
 *   cleanup: () => void | null,
 * }} DatagramStreamRecord
 *
 */

let udpSocketCnt = 0,
  datagramStreamCnt = 0;

/**
 * @type {Map<number, UdpSocketRecord>}
 */
export const udpSockets = new Map();

/**
 * @type {Map<number, DatagramStreamRecord>}
 */
export const datagramStreams = new Map();

/**
 * @param {IpAddressFamily} addressFamily
 * @returns {number}
 */
export function createUdpSocket({ family, unicastHopLimit }) {
  const udpSocket = createSocket({
    type: family === "ipv6" ? "udp6" : "udp4",
    reuseAddr: false,
    ipv6Only: family === "ipv6",
    lookup: noLookup,
  });
  udpSockets.set(++udpSocketCnt, {
    state: SOCKET_STATE_INIT,
    remoteAddress: null,
    remotePort: null,
    sendBufferSize: null,
    receiveBufferSize: null,
    unicastHopLimit,
    udpSocket,
    future: null,
    serializedLocalAddress: null,
    pollState: { ready: true, listener: null, polls: [], parentStream: null },
    incomingDatagramStream: null,
    outgoingDatagramStream: null,
  });
  return udpSocketCnt;
}

/**
 * @param {UdpSocketRecord} socket
 * @returns {DatagramStreamRecord}
 */
function createIncomingDatagramStream(socket) {
  const id = ++datagramStreamCnt;
  const pollState = {
    ready: false,
    listener: null,
    polls: [],
    parentStream: null,
  };
  const datagramStream = {
    id,
    active: true,
    error: null,
    socket,
    queue: [],
    cleanup,
    pollState,
  };
  const { udpSocket } = socket;
  datagramStreams.set(id, datagramStream);
  function cleanup() {
    udpSocket.off("message", onMessage);
    udpSocket.off("error", onError);
  }
  function onMessage(data, rinfo) {
    const family = rinfo.family.toLowerCase();
    datagramStream.queue.push({
      data,
      remoteAddress: ipSocketAddress(family, rinfo.address, rinfo.port),
    });
    if (!pollState.ready) pollStateReady(pollState);
  }
  function onError(err) {
    datagramStream.error = err;
    pollStateReady(datagramStream.pollState);
  }
  udpSocket.on("message", onMessage);
  udpSocket.once("error", onError);
  return datagramStream;
}

/**
 * @param {UdpSocketRecord} socket
 * @returns {DatagramStreamRecord}
 */
function createOutgoingDatagramStream(socket) {
  const id = ++datagramStreamCnt;
  const datagramStream = {
    id,
    active: true,
    error: null,
    socket,
    cleanup,
    pollState: { ready: true, listener: null, polls: [], parentStream: null },
  };
  const { udpSocket } = socket;
  datagramStreams.set(id, datagramStream);
  udpSocket.on("error", onError);
  function onError(err) {
    datagramStream.error = err;
    pollStateReady(datagramStream.pollState);
  }
  function cleanup() {
    udpSocket.off("error", onError);
  }
  return datagramStream;
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

export function socketUdpBindFinish(id) {
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
    socket.udpSocket.setTTL(socket.unicastHopLimit);
    if (socket.sendBufferSize)
      socket.udpSocket.setRecvBufferSize(socket.sendBufferSize);
    if (socket.receieveBufferSize)
      socket.udpSocket.setSendBufferSize(socket.receiveBufferSize);
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
  return ipSocketAddress(family.toLowerCase(), address, port);
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
  return ipSocketAddress(family.toLowerCase(), address, port);
}

export function socketUdpStream(id, remoteAddress) {
  const socket = udpSockets.get(id);
  const { udpSocket } = socket;

  if (
    socket.state !== SOCKET_STATE_BOUND &&
    socket.state !== SOCKET_STATE_CONNECTION
  )
    throw "invalid-state";

  if (socket.state === SOCKET_STATE_INIT && !remoteAddress)
    throw "invalid-state";

  if (
    remoteAddress &&
    (remoteAddress.val.port === 0 ||
      isWildcardAddress(remoteAddress) ||
      (remoteAddress.tag === "ipv6" && isIPv4MappedAddress(remoteAddress)))
  )
    throw "invalid-argument";

  if (socket.state === SOCKET_STATE_CONNECTION) {
    socketDatagramStreamClear(socket.incomingDatagramStream);
    socketDatagramStreamClear(socket.outgoingDatagramStream);
    try {
      udpSocket.disconnect();
    } catch (e) {
      throw convertSocketErrorCode(e);
    }
  }

  if (remoteAddress) {
    const serializedRemoteAddress = serializeIpAddress(remoteAddress);
    socket.remoteAddress = serializedRemoteAddress;
    socket.remotePort = remoteAddress.val.port;
    return new Promise((resolve, reject) => {
      function connectOk() {
        if (socket.state === SOCKET_STATE_INIT) {
          socket.udpSocket.setTTL(socket.unicastHopLimit);
          socket.udpSocket.setRecvBufferSize(socket.sendBufferSize);
          socket.udpSocket.setSendBufferSize(socket.receiveBufferSize);
        }
        udpSocket.off("error", connectErr);
        socket.state = SOCKET_STATE_CONNECTION;
        resolve([
          (socket.incomingDatagramStream = createIncomingDatagramStream(socket))
            .id,
          (socket.outgoingDatagramStream = createOutgoingDatagramStream(socket))
            .id,
        ]);
      }
      function connectErr(err) {
        udpSocket.off("connect", connectOk);
        reject(convertSocketError(err));
      }
      udpSocket.once("connect", connectOk);
      udpSocket.once("error", connectErr);
      udpSocket.connect(remoteAddress.val.port, serializedRemoteAddress);
    });
  } else {
    socket.state = SOCKET_STATE_BOUND;
    socket.remoteAddress = null;
    socket.remotePort = null;
    return [
      (socket.incomingDatagramStream = createIncomingDatagramStream(socket)).id,
      (socket.outgoingDatagramStream = createOutgoingDatagramStream(socket)).id,
    ];
  }
}

export function socketUdpSetReceiveBufferSize(id, bufferSize) {
  const socket = udpSockets.get(id);
  bufferSize = Number(bufferSize);
  if (
    socket.state !== SOCKET_STATE_INIT &&
    socket.state !== SOCKET_STATE_BIND
  ) {
    try {
      socket.udpSocket.setRecvBufferSize(bufferSize);
    } catch (err) {
      throw convertSocketError(err);
    }
  }
  socket.receiveBufferSize = bufferSize;
}

export function socketUdpSetSendBufferSize(id, bufferSize) {
  const socket = udpSockets.get(id);
  bufferSize = Number(bufferSize);
  if (
    socket.state !== SOCKET_STATE_INIT &&
    socket.state !== SOCKET_STATE_BIND
  ) {
    try {
      socket.udpSocket.setSendBufferSize(bufferSize);
    } catch (err) {
      throw convertSocketError(err);
    }
  }
  socket.sendBufferSize = bufferSize;
}

export function socketUdpSetUnicastHopLimit(id, hopLimit) {
  const socket = udpSockets.get(id);
  if (
    socket.state !== SOCKET_STATE_INIT &&
    socket.state !== SOCKET_STATE_BIND
  ) {
    try {
      socket.udpSocket.setTTL(hopLimit);
    } catch (err) {
      throw convertSocketError(err);
    }
  }
  socket.unicastHopLimit = hopLimit;
}

export async function socketUdpGetReceiveBufferSize(id) {
  const socket = udpSockets.get(id);
  if (socket.receiveBufferSize) return BigInt(socket.receiveBufferSize);
  if (
    socket.state !== SOCKET_STATE_INIT &&
    socket.state !== SOCKET_STATE_BIND
  ) {
    try {
      return BigInt(
        (socket.receiveBufferSize = socket.udpSocket.getRecvBufferSize())
      );
    } catch (err) {
      throw convertSocketError(err);
    }
  } else {
    return BigInt(
      (socket.receiveBufferSize = await getDefaultReceiveBufferSize())
    );
  }
}

export async function socketUdpGetSendBufferSize(id) {
  const socket = udpSockets.get(id);
  if (socket.sendBufferSize) return BigInt(socket.sendBufferSize);
  if (
    socket.state !== SOCKET_STATE_INIT &&
    socket.state !== SOCKET_STATE_BIND
  ) {
    try {
      return BigInt(
        (socket.sendBufferSize = socket.udpSocket.getSendBufferSize())
      );
    } catch (err) {
      throw convertSocketError(err);
    }
  } else {
    return BigInt((socket.sendBufferSize = await getDefaultSendBufferSize()));
  }
}

export function socketUdpGetUnicastHopLimit(id) {
  const { unicastHopLimit } = udpSockets.get(id);
  return unicastHopLimit;
}

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
  const datagramStream = datagramStreams.get(id);
  if (!datagramStream.active)
    throw new Error(
      "wasi-io trap: attempt to receive on inactive incoming datagram stream"
    );
  if (maxResults === 0n || datagramStream.queue.length === 0) return [];
  if (datagramStream.error) throw convertSocketError(datagramStream.error);
  return datagramStream.queue.splice(0, Number(maxResults));
}

export async function socketOutgoingDatagramStreamSend(id, datagrams) {
  const { active, socket } = datagramStreams.get(id);
  if (!active)
    throw new Error(
      "wasi-io trap: writing to inactive outgoing datagram stream"
    );

  const { udpSocket } = socket;
  let sendQueue = [],
    sendQueueAddress,
    sendQueuePort;
  let datagramsSent = 0;
  for (const { data, remoteAddress } of datagrams) {
    const address = remoteAddress
      ? serializeIpAddress(remoteAddress)
      : socket.remoteAddress;
    const port = remoteAddress?.val.port ?? socket.remotePort;
    let sendLastBatch = !UDP_BATCH_SENDS;
    if (sendQueue.length > 0) {
      if (sendQueueAddress === address && sendQueuePort === port) {
        sendQueue.push(data);
      } else {
        sendLastBatch = true;
      }
    } else {
      sendQueueAddress = address;
      sendQueuePort = port;
      sendQueue.push(data);
    }
    if (sendLastBatch) {
      const err = await doSendBatch();
      if (err) return BigInt(datagramsSent);
      if (UDP_BATCH_SENDS) {
        sendQueue = [data];
        sendQueuePort = port;
        sendQueueAddress = address;
      } else {
        sendQueue = [];
        sendQueuePort = port;
        sendQueueAddress = address;
      }
    }
  }
  if (sendQueue.length) {
    const err = await doSendBatch();
    if (err) return BigInt(datagramsSent);
  }

  if (datagramsSent !== datagrams.length)
    throw new Error("wasi-io trap: expected to have sent all the datagrams");
  return BigInt(datagramsSent);

  function doSendBatch() {
    return new Promise((resolve, reject) => {
      if (socket.remoteAddress) {
        if (sendQueueAddress !== socket.remoteAddress || sendQueuePort !== socket.remotePort)
          return void reject("invalid-argument");
        udpSocket.send(sendQueue, handler);
      } else {
        if (!sendQueueAddress)
          return void reject("invalid-argument");
        udpSocket.send(sendQueue, sendQueuePort, sendQueueAddress, handler);
      }
      function handler(err, _sentBytes) {
        if (err) {
          // TODO: update datagramsSent properly on error for multiple sends
          //       to enable send batching. Perhaps a Node.js PR could
          //       still set the second sendBytes arg?
          if (datagramsSent > 0) resolve(datagramsSent);
          else reject(convertSocketError(err));
          return;
        }
        datagramsSent += sendQueue.length;
        resolve(false);
      }
    });
  }
}

function checkSend(socket) {
  try {
    return Math.floor(
      (socket.udpSocket.getSendBufferSize() -
        socket.udpSocket.getSendQueueSize()) /
        1500
    );
  } catch (err) {
    throw convertSocketError(err);
  }
}

function pollSend(socket) {
  socket.pollState.ready = false;
  // The only way we have of dealing with getting a backpressure
  // ready signal in Node.js is to just poll on the queue reducing.
  // Ideally this should implement backoff on the poll interval,
  // but that work should be done alongside careful benchmarking
  // in due course.
  setTimeout(() => {
    const remaining = checkSend(socket);
    if (remaining > 0) {
      pollStateReady(socket.pollState);
    } else {
      pollSend(socket);
    }
  });
}

export function socketOutgoingDatagramStreamCheckSend(id) {
  const { active, socket } = datagramStreams.get(id);
  if (!active)
    throw new Error(
      "wasi-io trap: check send on inactive outgoing datagram stream"
    );
  const remaining = checkSend(socket);
  if (remaining <= 0) pollSend(socket);
  return BigInt(remaining);
}

function socketDatagramStreamClear(datagramStream) {
  datagramStream.active = false;
  if (datagramStream.cleanup) {
    datagramStream.cleanup();
    datagramStream.cleanup = null;
  }
}

export function socketDatagramStreamDispose(id) {
  const datagramStream = datagramStreams.get(id);
  datagramStream.active = false;
  if (datagramStream.cleanup) {
    datagramStream.cleanup();
    datagramStream.cleanup = null;
  }
  verifyPollsDroppedForDrop(datagramStream.pollState, "datagram stream");
  datagramStreams.delete(id);
}
