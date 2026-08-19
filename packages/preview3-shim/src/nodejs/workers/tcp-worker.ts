import { Socket, Server } from "node:net";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { once } from "node:events";

import { Router } from "../workers/resource-worker.js";
import { serializeIpAddress, makeIpAddress, ipAddressConflict } from "../sockets/address.js";
import { SocketError } from "../sockets/error.js";

// Socket instances stored by ID
const sockets = new Map<any, any>();
// Unique IDs for sockets
let NEXT_SOCKET_ID = 0n;

// Handle worker messages
Router()
  .beforeAll((msg) => {
    if (msg.op !== "tcp-create" && !sockets.has(msg.socketId)) {
      throw new Error("Invalid socket ID");
    }
  })
  .op("tcp-create", handleTcpCreate)
  .op("tcp-bind", handleTcpBind)
  .op("tcp-connect", handleTcpConnect)
  .op("tcp-listen", handleTcpListen)
  .op("tcp-send", handleTcpSend)
  .op("tcp-receive", handleTcpReceive)
  .op("tcp-get-local-address", handleGetLocalAddress)
  .op("tcp-get-remote-address", handleGetRemoteAddress)
  .op("tcp-set-listen-backlog-size", handleTcpSetBacklogSize)
  .op("tcp-set-keep-alive", handleTcpSetKeepAlive)
  .op("tcp-recv-buffer-size", handleRecvBufferSize)
  .op("tcp-send-buffer-size", handleSendBufferSize)
  .op("tcp-dispose", handleTcpDispose);

// Create a new TCP socket
function handleTcpCreate({ family }) {
  const socketId = NEXT_SOCKET_ID++;

  sockets.set(socketId, {
    family,
    tcp: null,
    server: null,
    acceptWriter: null,
    backlog: 128,
    localAddress: null,
    keepAliveEnabled: false,
    keepAliveIdleTime: 0,
    disposed: false,
    activeStreams: 0,
  });

  return { socketId };
}

// Bind a socket to local address
async function handleTcpBind({ socketId, localAddress }) {
  const socket = sockets.get(socketId);
  const address = serializeIpAddress(localAddress);
  const port = localAddress.val.port;

  const { family } = socket;

  const hasConflict = [...sockets].some(
    ([id, { localAddress: boundAddress }]) =>
      id !== socketId && boundAddress && ipAddressConflict(boundAddress, localAddress),
  );

  if (hasConflict) {
    const err = new Error("EADDRINUSE") as NodeJS.ErrnoException;
    err.code = "EADDRINUSE";
    throw err;
  }

  // node:net has no public standalone TCP bind API. Keep a server open
  // to reserve the endpoint, then reuse it for listen or close it for connect.
  const server = (socket.server = createTcpServer(socket));
  const onListening = once(server, "listening");
  server.listen({
    host: address,
    port,
    backlog: socket.backlog,
    ipv6Only: family === "ipv6",
  });
  await onListening;
  const boundAddress = server.address();
  if (!boundAddress || typeof boundAddress === "string") {
    throw new SocketError("invalid-state");
  }
  socket.localAddress = makeIpAddress(
    boundAddress.family.toLowerCase(),
    boundAddress.address,
    boundAddress.port,
  );
}

// Connect a socket to remote address
async function handleTcpConnect({ socketId, remoteAddress }) {
  const socket = sockets.get(socketId);
  const host = serializeIpAddress(remoteAddress);
  const port = remoteAddress.val.port;

  const localAddress = socket.localAddress;
  await closeTcpServer(socket);

  const tcp = (socket.tcp = new Socket({
    allowHalfOpen: true,
  }));
  tcp.setKeepAlive(socket.keepAliveEnabled, socket.keepAliveIdleTime);

  // TODO(tandr): Add lookup
  const onConnect = once(tcp, "connect");
  tcp.connect({
    port,
    host,
    localAddress: localAddress ? serializeIpAddress(localAddress) : undefined,
    localPort: localAddress?.val.port,
  });
  // events.once rejects when the emitter produces an error while waiting and
  // removes its temporary listeners after settling. A separate error promise
  // would remain attached after a successful connect and could later reject
  // unobserved when an established connection is reset.
  await onConnect;
}

async function handleTcpListen({ socketId, stream }) {
  const writer = stream.getWriter();
  const socket = sockets.get(socketId);
  const { backlog, family } = socket;

  socket.acceptWriter = writer;
  let server = socket.server;
  if (!server) {
    server = socket.server = createTcpServer(socket);
    const onListening = once(server, "listening");
    server.listen({
      host: family === "ipv6" ? "::" : "0.0.0.0",
      port: 0,
      backlog,
      ipv6Only: family === "ipv6",
    });
    await onListening;
  }

  const addr = server.address();
  if (addr && typeof addr === "object") {
    socket.localAddress = makeIpAddress(family, addr.address, addr.port);
  }
}

function createTcpServer(socket) {
  const server = new Server({
    pauseOnConnect: true,
    allowHalfOpen: true,
  });
  server.on("connection", (conn) => {
    const writer = socket.acceptWriter;
    // The reservation is already listening at the OS level, so reject any
    // connections that arrive before the WASI socket enters its listen state.
    if (!writer) {
      conn.destroy();
      return;
    }
    conn.allowHalfOpen = true;
    conn.setKeepAlive(socket.keepAliveEnabled, socket.keepAliveIdleTime);
    const id = NEXT_SOCKET_ID++;
    sockets.set(id, {
      family: socket.family,
      backlog: socket.backlog,
      tcp: conn,
      server: null,
      acceptWriter: null,
      localAddress: makeIpAddress(socket.family, conn.localAddress, conn.localPort),
      keepAliveEnabled: socket.keepAliveEnabled,
      keepAliveIdleTime: socket.keepAliveIdleTime,
      disposed: false,
      activeStreams: 0,
    });
    writer.write({ family: socket.family, socketId: id });
  });
  server.on("error", (err) => socket.acceptWriter?.abort(err));
  server.on("close", () => socket.acceptWriter?.close());
  return server;
}

function closeTcpServer(socket) {
  const server = socket.server;
  socket.server = null;
  if (!server) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function handleTcpSend({ socketId, stream }) {
  const socket = sockets.get(socketId);
  socket.activeStreams++;

  const { tcp } = socket;
  const readable = Readable.fromWeb(stream);

  try {
    await pipeline(readable, tcp);
  } finally {
    socket.activeStreams--;
    cleanupDisposedSocket(socketId, socket);
  }
}

async function handleTcpReceive({ socketId, stream }) {
  const socket = sockets.get(socketId);
  const writer = stream.getWriter();
  socket.activeStreams++;

  const { tcp } = socket;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let pending = Promise.resolve();

      const cleanup = () => {
        tcp.off("data", onData);
        tcp.off("end", onEnd);
        tcp.off("error", onError);
      };
      const settle = (err = null) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };
      const onData = (chunk) => {
        tcp.pause();
        pending = pending.then(async () => {
          try {
            await writer.write(chunk);
          } catch {
            settle();
            return;
          } finally {
            // Always undo the pause, even if the guest dropped or cancelled the
            // receive stream. Otherwise the send path can remain backpressured
            // forever.
            tcp.resume();
          }
        }, settle);
      };
      const onEnd = () => {
        pending = pending.then(async () => {
          try {
            await writer.close();
          } catch {
            // The guest can drop the receive stream before remote EOF.
          }
          settle();
        }, settle);
      };
      const onError = (err) => {
        pending = pending.finally(() => settle(err));
      };

      writer.closed.then(
        () => settle(),
        () => settle(),
      );
      tcp.on("data", onData);
      tcp.once("end", onEnd);
      tcp.once("error", onError);
      tcp.resume();
    });
  } finally {
    writer.releaseLock();
    socket.activeStreams--;
    cleanupDisposedSocket(socketId, socket);
  }
}

function cleanupDisposedSocket(socketId, socket) {
  if (!socket.disposed || socket.activeStreams > 0) {
    return;
  }

  if (socket.server) {
    socket.server.close();
  }

  if (socket.tcp) {
    socket.tcp.destroy();
  }
  sockets.delete(socketId);
}

async function handleGetLocalAddress({ socketId }) {
  const socket = sockets.get(socketId);
  const address = socket.tcp?.address();
  if (address && typeof address !== "string" && "family" in address) {
    return makeIpAddress(address.family.toLowerCase(), address.address, address.port);
  }
  if (socket.localAddress) {
    return socket.localAddress;
  }
  throw new SocketError("invalid-state");
}

async function handleGetRemoteAddress({ socketId }) {
  const socket = sockets.get(socketId);
  if (!socket.tcp?.remoteFamily || !socket.tcp.remoteAddress || !socket.tcp.remotePort) {
    throw new SocketError("invalid-state");
  }
  return makeIpAddress(
    socket.tcp.remoteFamily.toLowerCase(),
    socket.tcp.remoteAddress,
    socket.tcp.remotePort,
  );
}

function handleTcpSetBacklogSize({ socketId, value }) {
  const socket = sockets.get(socketId);
  socket.backlog = Number(value);
}

async function handleTcpSetKeepAlive({ socketId, keepAliveEnabled, keepAliveIdleTime }) {
  const socket = sockets.get(socketId);
  socket.keepAliveEnabled = keepAliveEnabled;
  socket.keepAliveIdleTime = Number(keepAliveIdleTime / 1_000_000_000n);
  socket.tcp?.setKeepAlive(socket.keepAliveEnabled, socket.keepAliveIdleTime);
}

async function handleRecvBufferSize({ socketId }) {
  const socket = sockets.get(socketId);

  if (socket.tcp) {
    return BigInt(socket.tcp.getRecvBufferSize());
  } else {
    return await getDefaultReceiveBufferSize();
  }
}

async function handleSendBufferSize({ socketId }) {
  const socket = sockets.get(socketId);
  if (socket.tcp) {
    return BigInt(socket.tcp.getSendBufferSize());
  } else {
    return await getDefaultSendBufferSize();
  }
}

function handleTcpDispose({ socketId }) {
  const socket = sockets.get(socketId);
  if (!socket) {
    return;
  }

  socket.disposed = true;
  cleanupDisposedSocket(socketId, socket);
}

let _recvBufferSize, _sendBufferSize;
async function getDefaultBufferSizes() {
  var s: any = new Socket();
  s.bind(0);
  await new Promise<void>((resolve, reject) => {
    s.once("error", reject);
    s.once("listening", resolve);
  });
  _recvBufferSize = BigInt(s.getRecvBufferSize());
  _sendBufferSize = BigInt(s.getSendBufferSize());
  s.close();
}

export async function getDefaultSendBufferSize() {
  if (!_sendBufferSize) {
    await getDefaultBufferSizes();
  }
  return _sendBufferSize;
}

export async function getDefaultReceiveBufferSize() {
  if (!_recvBufferSize) {
    await getDefaultBufferSizes();
  }
  return _recvBufferSize;
}
