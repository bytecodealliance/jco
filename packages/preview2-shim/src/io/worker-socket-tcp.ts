import {
  createFuture,
  createReadableStream,
  createReadableStreamPollState,
  createWritableStream,
  futureDispose,
  futureTakeValue,
  PollState,
  pollStateReady,
  verifyPollsDroppedForDrop,
} from "./worker-thread.js";
import process from "node:process";
// TODO: tcp_wrap is no longer exposed in newer versions of Node.js
const { TCP, constants: TCPConstants } = (process as any).binding("tcp_wrap");
import {
  convertSocketError,
  convertSocketErrorCode,
  ipSocketAddress,
  isIPv4MappedAddress,
  isMulticastIpAddress,
  isUnicastIpAddress,
  isWildcardAddress,
  noLookup,
  serializeIpAddress,
  SOCKET_STATE_BIND,
  SOCKET_STATE_BOUND,
  SOCKET_STATE_CLOSED,
  SOCKET_STATE_CONNECT,
  SOCKET_STATE_CONNECTION,
  SOCKET_STATE_INIT,
  SOCKET_STATE_LISTEN,
  SOCKET_STATE_LISTENER,
} from "./worker-sockets.js";
import { Server, Socket as TcpSocket } from "node:net";
import { IpSocketAddress } from "../../types/interfaces/wasi-sockets-network.js";

const win = process.platform === "win32";

interface PendingAccept {
  tcpSocket: TcpSocket | null;
  err: Error | null;
  pollState: PollState | null;
}

interface TcpSocketRecord {
  state: number;
  future: number | null;
  tcpSocket: TcpSocket | null;
  listenBacklogSize: number;
  // @ts-expect-error
  handle: TCP;
  pendingAccepts: PendingAccept[];
  pollState: PollState | null;
}

export const tcpSockets: Map<number, TcpSocketRecord> = new Map();

let tcpSocketCnt = 0;

export function createTcpSocket() {
  const handle = new TCP(TCPConstants.SOCKET);
  tcpSockets.set(++tcpSocketCnt, {
    state: SOCKET_STATE_INIT,
    future: null,
    tcpSocket: null,
    listenBacklogSize: 128,
    handle,
    pendingAccepts: [],
    pollState: {
      ready: true,
      listener: null,
      polls: [],
      parentStream: null,
    },
  });
  return tcpSocketCnt;
}

export function socketTcpFinish(id: number, fromState, toState) {
  const socket = tcpSockets.get(id)!;
  if (socket.state !== fromState) {
    throw "not-in-progress";
  }
  if (!socket.pollState?.ready) {
    throw "would-block";
  }
  const { tag, val } = futureTakeValue(socket.future)?.val ?? {};
  futureDispose(socket.future, false);
  socket.future = null;
  if (tag === "err") {
    socket.state = SOCKET_STATE_CLOSED;
    throw val;
  } else {
    socket.state = toState;
    // for the listener, we must immediately transition back to unresolved
    if (toState === SOCKET_STATE_LISTENER) {
      socket.pollState.ready = false;
    }
    return val;
  }
}

export function socketTcpBindStart(id: number, localAddress, family) {
  const socket = tcpSockets.get(id)!;
  if (socket.state !== SOCKET_STATE_INIT) {
    throw "invalid-state";
  }
  if (
    family !== localAddress.tag ||
    !isUnicastIpAddress(localAddress) ||
    isIPv4MappedAddress(localAddress)
  ) {
    throw "invalid-argument";
  }
  socket.state = SOCKET_STATE_BIND;
  const { handle } = socket;
  socket.future = createFuture(
    (async () => {
      const address = serializeIpAddress(localAddress);
      const port = localAddress.val.port;
      const code =
        localAddress.tag === "ipv6"
          ? handle.bind6(address, port, TCPConstants.UV_TCP_IPV6ONLY)
          : handle.bind(address, port);
      if (code !== 0) {
        throw convertSocketErrorCode(-code);
      }
      // This is a Node.js / libuv quirk to force the bind error to be thrown
      // (specifically address-in-use).
      {
        const out = {};
        const code = handle.getsockname(out);
        if (code !== 0) {
          throw convertSocketErrorCode(-code);
        }
      }
    })(),
    socket.pollState,
  );
}

export function socketTcpConnectStart(id: number, remoteAddress: IpSocketAddress, family) {
  const socket = tcpSockets.get(id)!;
  if (socket.state !== SOCKET_STATE_INIT && socket.state !== SOCKET_STATE_BOUND) {
    throw "invalid-state";
  }
  if (
    isWildcardAddress(remoteAddress) ||
    family !== remoteAddress.tag ||
    !isUnicastIpAddress(remoteAddress) ||
    isMulticastIpAddress(remoteAddress) ||
    remoteAddress.val.port === 0 ||
    isIPv4MappedAddress(remoteAddress)
  ) {
    throw "invalid-argument";
  }
  socket.state = SOCKET_STATE_CONNECT;
  socket.future = createFuture(
    new Promise((resolve, reject) => {
      const tcpSocket = (socket.tcpSocket = new TcpSocket({
        // @ts-expect-error Not present in type definition
        handle: socket.handle,
        pauseOnCreate: true,
        allowHalfOpen: true,
      }));
      function handleErr(err) {
        tcpSocket.off("connect", handleConnect);
        reject(convertSocketError(err));
      }
      function handleConnect() {
        tcpSocket.off("error", handleErr);
        resolve([createReadableStream(tcpSocket), createWritableStream(tcpSocket)]);
      }
      tcpSocket.once("connect", handleConnect);
      tcpSocket.once("error", handleErr);
      tcpSocket.connect({
        port: remoteAddress.val.port,
        host: serializeIpAddress(remoteAddress) ?? undefined,
        lookup: noLookup,
      });
    }),
    socket.pollState,
  );
}

export function socketTcpListenStart(id: number) {
  const socket = tcpSockets.get(id)!;
  if (socket.state !== SOCKET_STATE_BOUND) {
    throw "invalid-state";
  }
  const { handle } = socket;
  socket.state = SOCKET_STATE_LISTEN;
  socket.future = createFuture(
    new Promise<void>((resolve, reject) => {
      const server = new Server({
        pauseOnConnect: true,
        allowHalfOpen: true,
      });
      function handleErr(err) {
        server.off("listening", handleListen);
        reject(convertSocketError(err));
      }
      function handleListen() {
        server.off("error", handleErr);
        server.on("connection", (tcpSocket) => {
          pollStateReady(socket.pollState);
          const pollState = createReadableStreamPollState(tcpSocket);
          socket.pendingAccepts.push({
            tcpSocket,
            err: null,
            pollState,
          });
        });
        server.on("error", (err) => {
          pollStateReady(socket.pollState);
          socket.pendingAccepts.push({
            tcpSocket: null,
            err,
            pollState: null,
          });
        });
        resolve();
      }
      server.once("listening", handleListen);
      server.once("error", handleErr);
      server.listen(handle, socket.listenBacklogSize);
    }),
    socket.pollState,
  );
}

export function socketTcpAccept(id: number) {
  const socket = tcpSockets.get(id)!;
  if (socket.state !== SOCKET_STATE_LISTENER) {
    throw "invalid-state";
  }
  if (socket.pendingAccepts.length === 0) {
    throw "would-block";
  }
  const accept = socket.pendingAccepts.shift();
  if (!accept || accept.err) {
    socket.state = SOCKET_STATE_CLOSED;
    throw convertSocketError(accept?.err);
  }
  if (socket.pollState && socket.pendingAccepts.length === 0) {
    socket.pollState.ready = false;
  }
  tcpSockets.set(++tcpSocketCnt, {
    state: SOCKET_STATE_CONNECTION,
    future: null,
    tcpSocket: accept.tcpSocket,
    listenBacklogSize: 128,
    // @ts-expect-error
    handle: accept.tcpSocket?._handle,
    pendingAccepts: [],
    pollState: accept.pollState,
  });
  return [
    tcpSocketCnt,
    // @ts-expect-error
    createReadableStream(accept.tcpSocket, accept.pollState ?? undefined),
    createWritableStream(accept.tcpSocket),
  ];
}

export function socketTcpSetListenBacklogSize(id: number, backlogSize) {
  const socket = tcpSockets.get(id)!;
  if (socket.state === SOCKET_STATE_LISTEN || socket.state === SOCKET_STATE_LISTENER) {
    throw "not-supported";
  }
  if (
    socket.state !== SOCKET_STATE_INIT &&
    socket.state !== SOCKET_STATE_BIND &&
    socket.state !== SOCKET_STATE_BOUND
  ) {
    throw "invalid-state";
  }
  socket.listenBacklogSize = Number(backlogSize);
}

export function socketTcpGetLocalAddress(id: number) {
  const { handle } = tcpSockets.get(id)!;
  const out: any = {};
  const code = handle.getsockname(out);
  if (code !== 0) {
    throw convertSocketErrorCode(-code);
  }
  return ipSocketAddress(out.family.toLowerCase(), out.address, out.port);
}

export function socketTcpGetRemoteAddress(id: number) {
  const { handle } = tcpSockets.get(id)!;
  const out: any = {};
  const code = handle.getpeername(out);
  if (code !== 0) {
    throw convertSocketErrorCode(-code);
  }
  return ipSocketAddress(out.family.toLowerCase(), out.address, out.port);
}

export function socketTcpShutdown(id: number, _shutdownType) {
  const socket = tcpSockets.get(id)!;
  if (socket.state !== SOCKET_STATE_CONNECTION) {
    throw "invalid-state";
  }
  if (win && socket.tcpSocket?.destroySoon) {
    socket.tcpSocket.destroySoon();
  } else {
    socket.tcpSocket?.destroy();
  }
}

export function socketTcpSetKeepAlive(id: number, { keepAlive, keepAliveIdleTime }) {
  const { handle } = tcpSockets.get(id)!;
  const code = handle.setKeepAlive(keepAlive, Number(keepAliveIdleTime / 1_000_000_000n));
  if (code !== 0) {
    throw convertSocketErrorCode(-code);
  }
}

export function socketTcpDispose(id: number) {
  const socket = tcpSockets.get(id)!;
  verifyPollsDroppedForDrop(socket.pollState, "tcp socket");
  socket.handle.close();
  tcpSockets.delete(id);
}
