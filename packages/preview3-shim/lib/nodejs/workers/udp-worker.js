import { once } from "node:events";

import { Router } from "../workers/resource-worker.js";
import { serializeIpAddress, makeIpAddress } from "../sockets/address.js";

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
  const type = family === "ipv6" ? "udp6" : "udp4";
  const ipv6Only = family === "ipv6";
  const udp = dgram.createSocket({
    type,
    ipv6Only,
    reuseAddr: false,
    lookup: noLookup,
  });

  udp.on("error", () => {});
  sockets.set(socketId, { udp, family, connected: null });

  return { socketId };
}

async function handleBind({ socketId, localAddress }) {
  const socket = sockets.get(socketId);
  const addr = serializeIpAddress(localAddress);
  const port = localAddress.val.port;

  const onListening = once(socket.udp, "listening");
  const onError = once(socket.udp, "error").then(([err]) => {
    throw err;
  });

  socket.udp.bind(port, addr);

  await Promise.race([onListening, onError]);
}

function handleConnect({ socketId, remoteAddress }) {
  const socket = sockets.get(socketId);
  const addr = serializeIpAddress(remoteAddress);
  const port = remoteAddress.val.port;

  socket.udp.connect(port, addr);
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
}

async function handleReceive({ socketId }) {
  const socket = sockets.get(socketId);

  const [event, payload] = await Promise.race([
    once(socket.udp, "message").then(([msg, rinfo]) => ["message", { msg, rinfo }]),
    once(socket.udp, "error").then(([err]) => {
      throw err;
    }),
  ]);

  if (event === "message") {
    const { msg, rinfo } = payload;
    return {
      data: msg,
      remoteAddress: makeIpAddress(socket.family, rinfo.address, rinfo.port),
    };
  }
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
