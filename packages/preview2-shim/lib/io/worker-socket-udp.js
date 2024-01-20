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

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 *
 *
 * @typedef {{
 *   state: number,
 *   remoteAddress: string | null,
 *   sendBufferSize: number,
 *   receiveBufferSize: number,
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
 *   queue: Buffer[],
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
export function createUdpSocket({
  family,
  sendBufferSize,
  receiveBufferSize,
  unicastHopLimit,
}) {
  const udpSocket = createSocket({
    type: family === "ipv6" ? "udp6" : "udp4",
    reuseAddr: false,
    ipv6Only: family === "ipv6",
    lookup: noLookup,
  });
  udpSockets.set(++udpSocketCnt, {
    state: SOCKET_STATE_INIT,
    remoteAddress: null,
    sendBufferSize: Number(sendBufferSize),
    receiveBufferSize: Number(receiveBufferSize),
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
  const pollState = { ready: false, listener: null, polls: [], parentStream: null };
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
      remoteAddress: ipSocketAddress(family, rinfo.address, rinfo.port)
    });
    if (!pollState.ready)
      pollStateReady(pollState);
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
    socket.udpSocket.setRecvBufferSize(socket.sendBufferSize);
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
    socket.remoteAddress = `${serializedRemoteAddress}:${remoteAddress.val.port}`;
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
    return [
      (socket.incomingDatagramStream = createIncomingDatagramStream(socket)).id,
      (socket.outgoingDatagramStream = createOutgoingDatagramStream(socket)).id,
    ];
  }
}

export function socketUdpSetReceiveBufferSize(id, bufferSize) {
  const socket = udpSockets.get(id);
  bufferSize = Number(bufferSize);
  if (socket.state !== SOCKET_STATE_INIT) {
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
  if (socket.state !== SOCKET_STATE_INIT) {
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
  if (socket.state !== SOCKET_STATE_INIT) {
    try {
      socket.udpSocket.setTTL(hopLimit);
    } catch (err) {
      throw convertSocketError(err);
    }
  }
  socket.unicastHopLimit = hopLimit;
}

export function socketUdpGetReceiveBufferSize(id) {
  const { receiveBufferSize } = udpSockets.get(id);
  return BigInt(receiveBufferSize);
}

export function socketUdpGetSendBufferSize(id) {
  const { sendBufferSize } = udpSockets.get(id);
  return BigInt(sendBufferSize);
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
  if (maxResults === 0n || datagramStream.queue.length === 0)
    return [];
  if (datagramStream.error)
    throw convertSocketError(datagramStream.error);
  return datagramStream.queue.splice(0, Number(maxResults));
}

export function socketOutgoingDatagramStreamSend(id, datagrams) {
  const { active, socket } = datagramStreams.get(id);
  if (!active)
    throw new Error(
      "wasi-io trap: writing to inactive outgoing datagram stream"
    );

  const datagramsToSend = datagrams.map(({ data, remoteAddress }) => {
    const address = remoteAddress
      ? serializeIpAddress(remoteAddress)
      : undefined;
    const port = remoteAddress?.val.port;
    if (socket.remoteAddress) {
      if (remoteAddress && socket.remoteAddress !== `${address}:${port}`)
        throw "invalid-argument";
      return { data, address: undefined, port: undefined };
    }
    else {
      if (!address)
        throw "invalid-argument";
      return { data, address, port };
    }
  });

  const { udpSocket } = socket;
  return new Promise((resolve, reject) => {
    let sent = 0;
    let errored = false;
    for (const { data, address, port } of datagramsToSend) {
      if (errored)
        break;
      try {
        if (address)
          udpSocket.send(data, port, address, handler);
        else
          udpSocket.send(data, handler);
      }
      catch (e) {
        handler(e);
      }
    }
    function handler (err) {
      if (err) {
        errored = true;
        if (sent > 0) resolve(BigInt(sent));
        else reject(convertSocketError(err));
        return;
      }
      sent++;
      if (sent === datagrams.length) {
        resolve(BigInt(sent));
      }
    }
  });
}

export function socketOutgoingDatagramStreamCheckSend(id) {
  const { active, socket } = datagramStreams.get(id);
  if (!active)
    throw new Error(
      "wasi-io trap: check send on inactive outgoing datagram stream"
    );
  try {
    // TODO: backpressure
    return BigInt(
      Math.min(Math.floor(
        (socket.sendBufferSize - socket.udpSocket.getSendQueueSize()) / 1500
      ), 1)
    );
  } catch (err) {
    throw convertSocketError(err.errno);
  }
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
