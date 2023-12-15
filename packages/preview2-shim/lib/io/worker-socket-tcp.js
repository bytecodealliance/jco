// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const {
  TCP,
  constants: TCPConstants,
  TCPConnectWrap,
} = process.binding("tcp_wrap");
const { ShutdownWrap } = process.binding('stream_wrap');

/** @type {Map<number, NodeJS.Socket>} */
export const openedSockets = new Map();

let socketCnt = 0;

export function getSocketOrThrow(socketId) {
  const socket = openedSockets.get(socketId);
  if (!socket) throw "invalid-state";
  return socket;
}

//-----------------------------------------------------

/**
 * @param {IpAddressFamily} addressFamily
 * @returns {NodeJS.Socket}
 */
export function createTcpSocket() {
  const socket = new TCP(TCPConstants.SOCKET | TCPConstants.SERVER);
  openedSockets.set(++socketCnt, socket);
  return Promise.resolve(socketCnt);
}

export function socketTcpBind(id, payload) {
  const { localAddress, localPort, family } = payload;
  process._rawDebug("socketTcpBind", {
    localAddress, localPort, family
});

  const socket = getSocketOrThrow(id);

  let bind = "bind"; // ipv4
  if (family.toLocaleLowerCase() === "ipv6") {
    bind = "bind6";
  }

  return socket[bind](localAddress, localPort);
}

export function socketTcpConnect(id, payload) {
  const socket = getSocketOrThrow(id);
  const { remoteAddress, remotePort, localAddress, localPort, family } =
    payload;

    process._rawDebug("socketTcpConnect", {
        remoteAddress,
        remotePort,
        localAddress,
        localPort,
        family
    });

  return new Promise((resolve) => {
    const _onClientConnectComplete = (err) => {
      if (err) resolve(err);
      resolve(0);
    };
    const connectReq = new TCPConnectWrap();
    connectReq.oncomplete = _onClientConnectComplete;
    connectReq.address = remoteAddress;
    connectReq.port = remotePort;
    connectReq.localAddress = localAddress;
    connectReq.localPort = localPort;
    let connect = "connect"; // ipv4
    if (family.toLocaleLowerCase() === "ipv6") {
      connect = "connect6";
    }

    socket.onread = (_buffer) => {
      // TODO: handle data received from the server
    };
    socket.readStart();

    const err = socket[connect](connectReq, remoteAddress, remotePort);
    resolve(err);
  });
}

export function socketTcpListen(id, payload) {
    const socket = getSocketOrThrow(id);
    const { backlogSize } = payload;
    process._rawDebug("socketTcpListen", {
        backlogSize
    });
  return socket.listen(backlogSize);
}

export function socketTcpAccept(_id, _payload) {}

export function socketTcpGetLocalAddress(id) {
  const socket = getSocketOrThrow(id);
  const out = {};
  socket.getsockname(out);
  return out;
}

export function socketTcpGetRemoteAddress(id) {
  const socket = getSocketOrThrow(id);
  const out = {};
  socket.getpeername(out);
  return out;
}

export function socketTcpShutdown(id, _payload) {
  const socket = getSocketOrThrow(id);
  // const { shutdownType } = payload;

  return new Promise((resolve) => {
    const req = new ShutdownWrap();
    req.oncomplete = () => {
      process._rawDebug("shutdown complete");
      resolve(0);
    };
    req.handle = socket;
    req.callback = () => {
      process._rawDebug("shutdown callback");
      resolve(0);
    };
    const err = socket.shutdown(req);
    resolve(err);
  });
}

export function socketTcpSetKeepAlive(id, payload) {
  const socket = getSocketOrThrow(id);
  const { enable } = payload;

  return socket.setKeepAlive(enable);
}

export function socketTcpDispose(id) {
  const socket = getSocketOrThrow(id);
  socket.close();
  openedSockets.delete(id);
  return 0;
}
