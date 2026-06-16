import { createSocket, Socket } from "node:dgram";
import {
  createFuture,
  futureDispose,
  futureTakeValue,
  PollState,
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
import { IpAddressFamily, IpSocketAddress } from "../../types/interfaces/wasi-sockets-network.js";
import { OutgoingDatagram } from "../../types/interfaces/wasi-sockets-udp.js";

// Experimental support for batched UDP sends. Set this to true to enable.
// This is not enabled by default because we need to figure out how to know
// how many datagrams were sent when there is an error in a batch.
// See the err path in "handler" in the "doSendBatch" of socketOutgoingDatagramStreamSend.
const UDP_BATCH_SENDS = false;

interface UdpSocketRecord {
  state: number;
  remoteAddress: string | null;
  remotePort: number | null;
  sendBufferSize: number | null;
  receiveBufferSize: number | null;
  unicastHopLimit: number;
  udpSocket: Socket;
  future: number | null;
  serializedLocalAddress: string | null;
  pollState: PollState;
  incomingDatagramStream: DatagramStreamRecord | null;
  outgoingDatagramStream: DatagramStreamRecord | null;
}

interface DatagramStreamRecord {
  id: number;
  active: boolean;
  error: any | null;
  socket: UdpSocketRecord;
  pollState: PollState;
  queue?: Buffer[];
  cleanup: (() => void) | null;
}

let udpSocketCnt = 0,
  datagramStreamCnt = 0;

export const udpSockets = new Map<number, UdpSocketRecord>();

export const datagramStreams = new Map<number, DatagramStreamRecord>();

export function createUdpSocket({
  family,
  unicastHopLimit,
}: {
  family: IpAddressFamily;
  unicastHopLimit: number;
}): number {
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
    pollState: {
      ready: true,
      listener: () => null,
      polls: [],
      parentStream: null,
    },
    incomingDatagramStream: null,
    outgoingDatagramStream: null,
  });
  return udpSocketCnt;
}

function createIncomingDatagramStream(socket: UdpSocketRecord): DatagramStreamRecord {
  const id = ++datagramStreamCnt;
  const pollState: PollState = {
    ready: false,
    listener: null,
    polls: [],
    parentStream: null,
  };
  const datagramStream: DatagramStreamRecord = {
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
    datagramStream.queue?.push({
      data,
      remoteAddress: ipSocketAddress(family, rinfo.address, rinfo.port),
    } as any);
    if (!pollState.ready) {
      pollStateReady(pollState);
    }
  }
  function onError(err) {
    datagramStream.error = err;
    pollStateReady(datagramStream.pollState);
  }
  udpSocket.on("message", onMessage);
  udpSocket.once("error", onError);
  return datagramStream;
}

function createOutgoingDatagramStream(socket: UdpSocketRecord): DatagramStreamRecord {
  const id = ++datagramStreamCnt;
  const datagramStream = {
    id,
    active: true,
    error: null,
    socket,
    cleanup,
    pollState: {
      ready: true,
      listener: null,
      polls: [],
      parentStream: null,
    },
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

export function socketUdpBindStart(id: number, localAddress, family) {
  const socket = udpSockets.get(id)!;

  if (family !== localAddress.tag || isIPv4MappedAddress(localAddress)) {
    throw "invalid-argument";
  }

  const serializedLocalAddress = serializeIpAddress(localAddress);

  if (socket.state !== SOCKET_STATE_INIT) {
    throw "invalid-state";
  }
  socket.state = SOCKET_STATE_BIND;
  const { udpSocket } = socket;
  socket.future = createFuture(
    new Promise<void>((resolve, reject) => {
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
      udpSocket.bind(localAddress.val.port, serializedLocalAddress ?? undefined);
    }),
    socket.pollState,
  );
}

export function socketUdpBindFinish(id: number) {
  const socket = udpSockets.get(id)!;
  if (socket.state !== SOCKET_STATE_BIND) {
    throw "not-in-progress";
  }
  if (!socket.pollState.ready) {
    throw "would-block";
  }
  const { tag, val } = futureTakeValue(socket.future)?.val ?? {};
  futureDispose(socket.future, false);
  socket.future = null;
  if (tag === "err") {
    socket.state = SOCKET_STATE_CLOSED;
    throw val;
  } else {
    // once bound, we can now set the options
    // since Node.js doesn't support setting them until bound
    socket.udpSocket.setTTL(socket.unicastHopLimit);
    if (socket.sendBufferSize) {
      socket.udpSocket.setRecvBufferSize(socket.sendBufferSize);
    }
    if (socket.receiveBufferSize) {
      socket.udpSocket.setSendBufferSize(socket.receiveBufferSize);
    }
    socket.state = SOCKET_STATE_BOUND;
    return val;
  }
}

export function socketUdpGetLocalAddress(id: number): IpSocketAddress {
  const { udpSocket } = udpSockets.get(id)!;
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
  const { udpSocket } = udpSockets.get(id)!;
  let address, family, port;
  try {
    ({ address, family, port } = udpSocket.remoteAddress());
  } catch (err) {
    throw convertSocketError(err);
  }
  return ipSocketAddress(family.toLowerCase(), address, port);
}

export function socketUdpStream(id, remoteAddress) {
  const socket = udpSockets.get(id)!;
  const { udpSocket } = socket;

  if (socket.state !== SOCKET_STATE_BOUND && socket.state !== SOCKET_STATE_CONNECTION) {
    throw "invalid-state";
  }

  if (socket.state === SOCKET_STATE_INIT && !remoteAddress) {
    throw "invalid-state";
  }

  if (
    remoteAddress &&
    (remoteAddress.val.port === 0 ||
      isWildcardAddress(remoteAddress) ||
      (remoteAddress.tag === "ipv6" && isIPv4MappedAddress(remoteAddress)))
  ) {
    throw "invalid-argument";
  }

  if (socket.state === SOCKET_STATE_CONNECTION) {
    socketDatagramStreamClear(socket.incomingDatagramStream!);
    socketDatagramStreamClear(socket.outgoingDatagramStream!);
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
          socket.udpSocket.setRecvBufferSize(socket.sendBufferSize!);
          socket.udpSocket.setSendBufferSize(socket.receiveBufferSize!);
        }
        udpSocket.off("error", connectErr);
        socket.state = SOCKET_STATE_CONNECTION;
        resolve([
          (socket.incomingDatagramStream = createIncomingDatagramStream(socket)).id,
          (socket.outgoingDatagramStream = createOutgoingDatagramStream(socket)).id,
        ]);
      }
      function connectErr(err) {
        udpSocket.off("connect", connectOk);
        reject(convertSocketError(err));
      }
      udpSocket.once("connect", connectOk);
      udpSocket.once("error", connectErr);
      udpSocket.connect(remoteAddress.val.port, serializedRemoteAddress ?? undefined);
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

export function socketUdpSetReceiveBufferSize(id: number, bufferSize: bigint) {
  const socket = udpSockets.get(id)!;
  const buf = Number(bufferSize);
  if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BIND) {
    try {
      socket.udpSocket.setRecvBufferSize(buf);
    } catch (err) {
      throw convertSocketError(err);
    }
  }
  socket.receiveBufferSize = buf;
}

export function socketUdpSetSendBufferSize(id: number, bufferSize: bigint) {
  const socket = udpSockets.get(id)!;
  const buf = Number(bufferSize);
  if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BIND) {
    try {
      socket.udpSocket.setSendBufferSize(buf);
    } catch (err) {
      throw convertSocketError(err);
    }
  }
  socket.sendBufferSize = buf;
}

export function socketUdpSetUnicastHopLimit(id: number, hopLimit: number) {
  const socket = udpSockets.get(id)!;
  if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BIND) {
    try {
      socket.udpSocket.setTTL(hopLimit);
    } catch (err) {
      throw convertSocketError(err);
    }
  }
  socket.unicastHopLimit = hopLimit;
}

export async function socketUdpGetReceiveBufferSize(id: number) {
  const socket = udpSockets.get(id)!;
  if (socket.receiveBufferSize) {
    return BigInt(socket.receiveBufferSize);
  }
  if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BIND) {
    try {
      return BigInt((socket.receiveBufferSize = socket.udpSocket.getRecvBufferSize()));
    } catch (err) {
      throw convertSocketError(err);
    }
  } else {
    const receiveBufferSize = await getDefaultReceiveBufferSize();
    socket.receiveBufferSize = Number(receiveBufferSize);
    return receiveBufferSize;
  }
}

export async function socketUdpGetSendBufferSize(id: number) {
  const socket = udpSockets.get(id)!;
  if (socket.sendBufferSize) {
    return BigInt(socket.sendBufferSize);
  }
  if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BIND) {
    try {
      return BigInt((socket.sendBufferSize = socket.udpSocket.getSendBufferSize()));
    } catch (err) {
      throw convertSocketError(err);
    }
  } else {
    const sendBufferSize = await getDefaultSendBufferSize();
    socket.sendBufferSize = Number(sendBufferSize);
    return sendBufferSize;
  }
}

export function socketUdpGetUnicastHopLimit(id: number) {
  const { unicastHopLimit } = udpSockets.get(id)!;
  return unicastHopLimit;
}

export function socketUdpDispose(id: number) {
  const { udpSocket } = udpSockets.get(id)!;
  return new Promise((resolve) => {
    udpSocket.close(() => {
      udpSockets.delete(id);
      resolve(0);
    });
  });
}

export function socketIncomingDatagramStreamReceive(id: number, maxResults: bigint) {
  const datagramStream = datagramStreams.get(id)!;
  if (!datagramStream.active) {
    throw new Error("wasi-io trap: attempt to receive on inactive incoming datagram stream");
  }
  if (maxResults === 0n || datagramStream.queue?.length === 0) {
    return [];
  }
  if (datagramStream.error) {
    throw convertSocketError(datagramStream.error);
  }
  return datagramStream.queue?.splice(0, Number(maxResults));
}

export async function socketOutgoingDatagramStreamSend(id: number, datagrams: OutgoingDatagram[]) {
  const { active, socket } = datagramStreams.get(id)!;
  if (!active) {
    throw new Error("wasi-io trap: writing to inactive outgoing datagram stream");
  }

  const { udpSocket } = socket;
  let sendQueue: Uint8Array[] = [];
  let sendQueueAddress: string | null = null;
  let sendQueuePort: number | null = null;
  let datagramsSent = 0;
  for (const { data, remoteAddress } of datagrams) {
    const address = remoteAddress ? serializeIpAddress(remoteAddress) : socket.remoteAddress;
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
      if (err) {
        return BigInt(datagramsSent);
      }
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
    if (err) {
      return BigInt(datagramsSent);
    }
  }

  if (datagramsSent !== datagrams.length) {
    throw new Error("wasi-io trap: expected to have sent all the datagrams");
  }
  return BigInt(datagramsSent);

  function doSendBatch() {
    return new Promise((resolve, reject) => {
      if (socket.remoteAddress) {
        if (sendQueueAddress !== socket.remoteAddress || sendQueuePort !== socket.remotePort) {
          return void reject("invalid-argument");
        }
        udpSocket.send(sendQueue, handler);
      } else {
        if (!sendQueueAddress) {
          return void reject("invalid-argument");
        }
        // @ts-expect-error Proper function overload is not being recognized
        udpSocket.send(sendQueue, sendQueuePort, sendQueueAddress, handler);
      }
      function handler(err: any, _sentBytes: unknown) {
        if (err) {
          // TODO: update datagramsSent properly on error for multiple sends
          //       to enable send batching. Perhaps a Node.js PR could
          //       still set the second sendBytes arg?
          if (datagramsSent > 0) {
            resolve(datagramsSent);
          } else {
            reject(convertSocketError(err));
          }
          return;
        }
        datagramsSent += sendQueue.length;
        resolve(false);
      }
    });
  }
}

function checkSend(socket: UdpSocketRecord) {
  try {
    return Math.floor(
      (socket.udpSocket.getSendBufferSize() - socket.udpSocket.getSendQueueSize()) / 1500,
    );
  } catch (err) {
    throw convertSocketError(err);
  }
}

function pollSend(socket: UdpSocketRecord) {
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

export function socketOutgoingDatagramStreamCheckSend(id: number) {
  const { active, socket } = datagramStreams.get(id)!;
  if (!active) {
    throw new Error("wasi-io trap: check send on inactive outgoing datagram stream");
  }
  const remaining = checkSend(socket);
  if (remaining <= 0) {
    pollSend(socket);
  }
  return BigInt(remaining);
}

function socketDatagramStreamClear(datagramStream: DatagramStreamRecord) {
  datagramStream.active = false;
  if (datagramStream.cleanup) {
    datagramStream.cleanup();
    datagramStream.cleanup = null;
  }
}

export function socketDatagramStreamDispose(id) {
  const datagramStream = datagramStreams.get(id)!;
  datagramStream.active = false;
  if (datagramStream.cleanup) {
    datagramStream.cleanup();
    datagramStream.cleanup = () => null;
  }
  verifyPollsDroppedForDrop(datagramStream.pollState, "datagram stream");
  datagramStreams.delete(id);
}
