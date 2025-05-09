import { parentPort } from "worker_threads";
import { randomUUID } from "node:crypto";
import dgram from "node:dgram";
import { serializeIpAddress, makeIpAddress } from "../sockets/address.js";
import { mapErrorCode } from "../sockets/error.js";

const sockets = new Map();

parentPort.on("message", async (msg) => {
  const { id, op } = msg;

  try {
    let result;

    // All operations except "udp-create" require a valid socket ID
    if (op !== "udp-create" && !sockets.has(msg.socketId)) {
      throw new Error("Invalid socket ID");
    }

    switch (op) {
      case "udp-create":
        result = handleCreate(msg);
        break;
      case "udp-bind":
        result = await handleBind(msg);
        break;
      case "udp-connect":
        result = handleConnect(msg);
        break;
      case "udp-disconnect":
        result = handleDisconnect(msg);
        break;
      case "udp-send":
        result = await handleSend(msg);
        break;
      case "udp-receive":
        result = await handleReceive(msg);
        break;
      case "udp-get-local-address":
        result = handleGetLocal(msg);
        break;
      case "udp-set-unicast-hop-limit":
        result = handleSetHop(msg);
        break;
      case "udp-recv-buffer-size":
        result = handleRecvBuffer(msg);
        break;
      case "udp-send-buffer-size":
        result = handleSendBuffer(msg);
        break;
      case "udp-dispose":
        result = handleDispose(msg);
        break;
      default:
        throw new Error(`Unknown op ${op}`);
    }
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({
      id,
      error: { message: e.message, code: e.code || "UNKNOWN", stack: e.stack },
    });
  }
});

function handleCreate({ family }) {
  const socketId = randomUUID();
  const type = family === "ipv6" ? "udp6" : "udp4";
  const udp = dgram.createSocket({ type });

  sock.on("error", () => {});
  sockets.set(socketId, { udp, family, connected: null });

  return { socketId };
}

async function handleBind({ socketId, localAddress }) {
  const addr = serializeIpAddress(localAddress);
  await new Promise((res, rej) => {
    socket.udp.bind(localAddress.val.port, addr, (err) => {
      if (err) rej(err);
      else res();
    });
  });

  return { success: true };
}

function handleConnect({ socketId, remoteAddress }) {
  const socket = sockets.get(socketId);
  const addr = serializeIpAddress(remoteAddress);
  const port = remoteAddress.val.port;
  socket.udp.connect(port, addr);
  socket.connected = remoteAddress;

  return { success: true };
}

function handleDisconnect({ socketId }) {
  socket.udp.disconnect();
  socket.connected = null;

  return { success: true };
}

async function handleSend({ socketId, data, remoteAddress }) {
  const socket = sockets.get(socketId);
  const addr = serializeIpAddress(remoteAddress);
  await new Promise((res, rej) => {
    socket.udp.send(data, remoteAddress.val.port, addr, (err) => {
      if (err) rej(err);
      else res();
    });
  });
  return {};
}

async function handleReceive({ socketId }) {
  const socket = sockets.get(socketId);
  if (!socket) throw new Error("Invalid socket ID");
  return await new Promise((res) => {
    socket.udp.once("message", (msg, rinfo) => {
      res({
        data: msg,
        remoteAddress: makeIpAddress(socket.family, rinfo.address, rinfo.port),
      });
    });
  });
}

function handleGetLocal({ socketId }) {
  const socket = sockets.get(socketId);
  const addr = socket.udp.address();
  return makeIpAddress(socket.family, addr.address, addr.port);
}

function handleSetHop({ socketId, value }) {
  const socket = sockets.get(socketId);
  if (!socket) throw new Error("Invalid socket ID");

  socket.udp.setTTL(value);
  return { success: true };
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
  return { success: true };
}
