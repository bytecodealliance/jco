import { Socket, Server } from "node:net";
import { parentPort } from "worker_threads";
import { randomUUID } from "node:crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { serializeIpAddress } from "../sockets/address.js";
import { mapErrorCode } from "../sockets/error.js";

import process from "node:process";
const { TCP, constants: TCPConstants } = process.binding("tcp_wrap");

// Socket instances stored by ID
const sockets = new Map();

// Handle worker messages
parentPort.on("message", async (msg) => {
  const { id, op } = msg;

  try {
    let result;

    // All operations except "tcp-create" require a valid socket ID
    if (op !== "tcp-create" && !sockets.has(msg.socketId)) {
      throw new Error("Invalid socket ID");
    }

    switch (op) {
      case "tcp-create":
        result = handleTcpCreate(msg);
        break;
      case "tcp-bind":
        result = await handleTcpBind(msg);
        break;
      case "tcp-connect":
        result = await handleTcpConnect(msg);
        break;
      case "tcp-listen":
        result = await handleTcpListen(msg);
        break;
      case "tcp-send":
        result = await handleTcpSend(msg);
        break;
      case "tcp-receive":
        result = await handleTcpReceive(msg);
        break;
      case "tcp-get-local-address":
        result = await handleGetLocalAddress(msg);
        break;
      case "tcp-get-remote-address":
        result = await handleGetRemoteAddress(msg);
        break;
      case "tcp-set-listen-backlog-size":
        result = await handleTcpSetBacklogSize(msg);
        break;
      case "tcp-set-keep-alive":
        result = await handleTcpSetKeepAlive(msg);
        break;
      case "tcp-recv-buffer-size":
        result = await handleRecvBufferSize(msg);
        break;
      case "tcp-send-buffer-size":
        result = await handleSendBufferSize(msg);
        break;
      case "tcp-dispose":
        result = handleTcpDispose(msg);
        break;
      default:
        throw new Error(`Unknown operation: ${op}`);
    }

    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({
      id,
      error: {
        message: error.message,
        code: error.code || "UNKNOWN",
        stack: error.stack,
      },
    });
  }
});

// Create a new TCP socket
function handleTcpCreate({ family }) {
  const socketId = randomUUID();
  const handle = new TCP(TCPConstants.SOCKET);

  sockets.set(socketId, {
    handle,
    family,
    tcp: null,
    backlog: 128,
  });

  return { socketId };
}

// Bind a socket to local address
async function handleTcpBind({ socketId, localAddress }) {
  const socket = sockets.get(socketId);
  const address = serializeIpAddress(localAddress);
  const port = localAddress.val.port;

  const { handle, family } = socket;

  await new Promise((resolve, reject) => {
    let code;
    if (family === "ipv6") {
      code = handle.bind6(address, port, TCPConstants.UV_TCP_IPV6ONLY);
    } else {
      code = handle.bind(address, port);
    }

    if (code !== 0) {
      reject(new Error(mapErrorCode(-code)));
    } else {
      resolve();
    }
  });

  return { success: true };
}

// Connect a socket to remote address
async function handleTcpConnect({ socketId, remoteAddress }) {
  const socket = sockets.get(socketId);
  const { handle } = socket;

  const host = serializeIpAddress(remoteAddress);
  const port = remoteAddress.val.port;

  const tcp = (socket.tcp = new Socket({
    handle: socket.handle,
    pauseOnCreate: true,
    allowHalfOpen: true,
  }));

  // TODO(tandr): Add lookup
  tcp.connect({ port, host });

  await Promise.race([
    once(tcp, "connect"),
    once(tcp, "error").then(([err]) => {
      throw err;
    }),
  ]);

  return { success: true };
}

async function handleTcpListen({ socketId, stream }) {
  const socket = sockets.get(socketId);
  const { handle, backlog, family } = socket;

  const server = new Server({
    pauseOnConnect: true,
    allowHalfOpen: true,
  });

  server.listen(handle, backlog);

  await Promise.race([
    once(server, "listening"),
    once(server, "error").then(([err]) => {
      throw err;
    }),
  ]);

  server.on("connection", (conn) => {
    const id = randomUUID();
    sockets.set(id, { handle: conn._handle, family, backlog, tcp: conn });
    stream.write({ family, socketId: id });
  });

  server.on("error", (err) => stream.abort(err));
  stream.closed.then(() => server.close());

  return { success: true };
}

async function handleTcpSend({ socketId, stream }) {
  const socket = sockets.get(socketId);
  const { tcp } = socket;
  const readable = Readable.fromWeb(stream);

  // TODO(tandr): Should we handle FIN packet?
  await pipeline(readable, tcp);
  return { success: true };
}

async function handleTcpReceive({ socketId, stream }) {
  const socket = sockets.get(socketId);
  const { tcp } = socket;

  const writable = Writable.fromWeb(stream);
  await pipeline(tcp, writable);
  return { success: true };
}

async function handleGetLocalAddress(socketId) {
  const socket = sockets.get(socketId);
  const out = {};

  const code = socket.handle.getsockname(out);
  if (code !== 0) {
    throw new Error(mapErrorCode(-code));
  }

  return makeIpAddress(out.family.toLowerCase(), out.address, out.port);
}

async function handleGetRemoteAddress(socketId) {
  const socket = sockets.get(socketId);
  const out = {};

  const code = socket.handle.getpeername(out);
  if (code !== 0) {
    throw new Error(mapErrorCode(-code));
  }

  return makeIpAddress(out.family.toLowerCase(), out.address, out.port);
}

function handleTcpSetBacklogSize({ socketId, value }) {
  const socket = sockets.get(socketId);
  socket.backlog = Number(value);
}

async function handleTcpSetKeepAlive({
  socketId,
  keepAliveEnabled,
  keepAliveIdleTime,
}) {
  const socket = sockets.get(socketId);
  const time = Number(keepAliveIdleTime / 1_000_000_000n);

  const code = socket.handle.setKeepAlive(keepAliveEnabled, time);
  if (code !== 0) throw mapErrorCode(-code);
}

async function handleRecvBufferSize({ socketId, value }) {
  const socket = sockets.get(socketId);

  if (socket.tcp) {
    return BigInt(socket.tcp.getRecvBufferSize());
  } else {
    return await getDefaultRecvBufferSize();
  }
}

async function handleSendBufferSize({ socketId, value }) {
  const socket = sockets.get(socketId);
  if (socket.tcp) {
    return BigInt(socket.tcp.getSendBufferSize());
  } else {
    return await getDefaultSendBufferSize();
  }
}

function handleTcpDispose({ socketId }) {
  const socket = sockets.get(socketId);
  socket.tcp.destroy();
  socket.handle.close();
  sockets.delete(socketId);
}

let _recvBufferSize, _sendBufferSize;
async function getDefaultBufferSizes() {
  var s = new Socket({ type: "udp4" });
  s.bind(0);
  await new Promise((resolve, reject) => {
    s.once("error", reject);
    s.once("listening", resolve);
  });
  _recvBufferSize = BigInt(s.getRecvBufferSize());
  _sendBufferSize = BigInt(s.getSendBufferSize());
  s.close();
}

export async function getDefaultSendBufferSize() {
  if (!_sendBufferSize) await getDefaultBufferSizes();
  return _sendBufferSize;
}

export async function getDefaultReceiveBufferSize() {
  if (!_recvBufferSize) await getDefaultBufferSizes();
  return _recvBufferSize;
}
