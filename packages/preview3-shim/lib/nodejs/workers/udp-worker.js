import { once } from "node:events";

import { Router } from "../workers/resource-worker.js";
import {
  serializeIpAddress,
  makeIpAddress,
  ipAddressConflict,
  isLoopbackIpAddress,
} from "../sockets/address.js";

import dgram from "node:dgram";

const sockets = new Map();
// Unique IDs for sockets
let NEXT_SOCKET_ID = 0n;

export function noLookup(ip, _opts, cb) {
  cb(null, ip);
}

Router()
  .beforeAll((msg) => {
    if (msg.op !== "udp-create" && !sockets.has(msg.socketId)) {
      throw new Error("Invalid socket ID");
    }
  })
  .op("udp-create", handleCreate)
  .op("udp-bind", handleBind)
  .op("udp-connect", handleConnect)
  .op("udp-disconnect", handleDisconnect)
  .op("udp-send", handleSend)
  .op("udp-receive", handleReceive)
  .op("udp-get-local-address", handleGetLocal)
  .op("udp-set-unicast-hop-limit", handleSetHop)
  .op("udp-recv-buffer-size", handleRecvBuffer)
  .op("udp-send-buffer-size", handleSendBuffer)
  .op("udp-dispose", handleDispose);

function handleCreate({ family }) {
  const socketId = NEXT_SOCKET_ID++;
  const socket = {
    family,
    connected: null,
    localAddress: null,
    receiveQueue: [],
  };
  socket.udp = createSocket(socket);
  sockets.set(socketId, socket);

  return { socketId };
}

function createSocket(socket) {
  const type = socket.family === "ipv6" ? "udp6" : "udp4";
  const ipv6Only = socket.family === "ipv6";
  const udp = dgram.createSocket({
    type,
    ipv6Only,
    reuseAddr: false,
    lookup: noLookup,
  });

  udp.on("message", (msg, rinfo) => socket.receiveQueue.push({ msg, rinfo }));
  udp.on("error", () => {});
  return udp;
}

async function handleBind({ socketId, localAddress }) {
  const socket = sockets.get(socketId);
  const hasConflict = [...sockets].some(
    ([id, { localAddress: boundAddress }]) =>
      id !== socketId && boundAddress && ipAddressConflict(boundAddress, localAddress),
  );

  if (hasConflict) {
    const err = new Error("EADDRINUSE");
    err.code = "EADDRINUSE";
    throw err;
  }

  const addr = serializeIpAddress(localAddress);
  const port = localAddress.val.port;

  const onListening = once(socket.udp, "listening");
  const onError = once(socket.udp, "error").then(([err]) => {
    throw err;
  });

  socket.udp.bind(port, addr);

  await Promise.race([onListening, onError]);
  const boundAddr = socket.udp.address();
  socket.localAddress = makeIpAddress(socket.family, boundAddr.address, boundAddr.port);
}

async function handleConnect({ socketId, remoteAddress }) {
  const socket = sockets.get(socketId);
  const preserveLocalAddress =
    socket.connected &&
    socket.localAddress &&
    isLoopbackIpAddress(socket.connected) &&
    isLoopbackIpAddress(remoteAddress);

  if (socket.connected) {
    const localAddress = preserveLocalAddress ? socket.localAddress : null;
    await new Promise((resolve) => socket.udp.close(resolve));
    socket.udp = createSocket(socket);
    if (localAddress) {
      await handleBind({ socketId, localAddress });
    } else {
      socket.localAddress = null;
    }
  }

  const addr = serializeIpAddress(remoteAddress);
  const port = remoteAddress.val.port;

  await new Promise((resolve, reject) => {
    socket.udp.connect(port, addr, (err) => (err ? reject(err) : resolve()));
  });
  const boundAddr = socket.udp.address();
  socket.localAddress = makeIpAddress(socket.family, boundAddr.address, boundAddr.port);
  socket.connected = remoteAddress;
}

function handleDisconnect({ socketId }) {
  const socket = sockets.get(socketId);
  socket.udp.disconnect();
  socket.connected = null;
}

async function handleSend({ socketId, data, remoteAddress }) {
  const socket = sockets.get(socketId);
  const isConnected = socket.connected != null;

  await new Promise((resolve, reject) => {
    if (isConnected) {
      socket.udp.send(data, (err) => (err ? reject(err) : resolve()));
    } else {
      const addr = serializeIpAddress(remoteAddress);
      const port = remoteAddress.val.port;

      socket.udp.send(data, port, addr, (err) => (err ? reject(err) : resolve()));
    }
  });

  const boundAddr = socket.udp.address();
  socket.localAddress = makeIpAddress(socket.family, boundAddr.address, boundAddr.port);
}

async function handleReceive({ socketId }) {
  const socket = sockets.get(socketId);
  if (socket.receiveQueue.length === 0) {
    await Promise.race([
      once(socket.udp, "message"),
      once(socket.udp, "error").then(([err]) => {
        throw err;
      }),
    ]);
  }

  const { msg, rinfo } = socket.receiveQueue.shift();
  return {
    data: msg,
    remoteAddress: makeIpAddress(socket.family, rinfo.address, rinfo.port),
  };
}

function handleGetLocal({ socketId }) {
  const socket = sockets.get(socketId);
  const addr = socket.udp.address();
  return makeIpAddress(socket.family, addr.address, addr.port);
}

function handleSetHop({ socketId, value }) {
  const socket = sockets.get(socketId);
  socket.udp.setTTL(value);
}

function handleRecvBuffer({ socketId }) {
  const socket = sockets.get(socketId);
  return BigInt(socket.udp.getRecvBufferSize());
}

function handleSendBuffer({ socketId }) {
  const socket = sockets.get(socketId);
  return BigInt(socket.udp.getSendBufferSize());
}

function handleDispose({ socketId }) {
  const socket = sockets.get(socketId);
  socket.udp.close();
  sockets.delete(socketId);
}
