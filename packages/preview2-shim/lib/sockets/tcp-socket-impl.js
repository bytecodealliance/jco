/* eslint-disable no-unused-vars */

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").TcpSocket} TcpSocket
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").InputStream} InputStream
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").OutputStream} OutputStream
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../types/interfaces/wasi-poll-poll").Pollable} Pollable
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").ShutdownType} ShutdownType
 */

// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const {
  TCP,
  TCPConnectWrap,
  constants: TCPConstants,
} = process.binding("tcp_wrap");
const { ShutdownWrap } = process.binding("stream_wrap");
import { isIP, Socket as NodeSocket } from "node:net";
import { EventEmitter } from "node:events";

function tupleToIPv6(arr) {
  if (arr.length !== 8) {
    return null;
  }
  return arr.map((segment) => segment.toString(16)).join(":");
}

function tupleToIpv4(arr) {
  if (arr.length !== 4) {
    return null;
  }
  return arr.map((segment) => segment.toString(10)).join(".");
}

function ipv6ToTuple(ipv6) {
  return ipv6.split(":").map((segment) => parseInt(segment, 16));
}

function ipv4ToTuple(ipv4) {
  return ipv4.split(".").map((segment) => parseInt(segment, 10));
}

function serializeIpAddress(addr, family) {
  let { address } = addr.val;
  if (family.toLocaleLowerCase() === "ipv4") {
    address = tupleToIpv4(address);
  } else if (family.toLocaleLowerCase() === "ipv6") {
    address = tupleToIPv6(address);
  }
  return address;
}

function deserializeIpAddress(addr, family) {
  let address = [];
  if (family.toLocaleLowerCase() === "ipv4") {
    address = ipv4ToTuple(addr);
  } else if (family.toLocaleLowerCase() === "ipv6") {
    address = ipv6ToTuple(addr);
  }
  return address;
}

function assert(condition, message) {
  if (condition) {
    throw new Error(message);
  }
}

// TODO: implement would-block exceptions
// TODO: implement concurrency-conflict exceptions
export class TcpSocketImpl extends EventEmitter {
  /** @type {TCP.TCPConstants.SERVER} */ #serverHandle = null;
  /** @type {TCP.TCPConstants.SOCKET} */ #clientHandle = null;
  /** @type {Network} */ network = null;

  id = 0;
  #isBound = false;
  #socketOptions = {};
  #canReceive = true;
  #canSend = true;
  #ipv6Only = false;
  #state = "closed";
  #inProgress = false;
  #connections = 0;

  // See: https://github.com/torvalds/linux/blob/fe3cfe869d5e0453754cf2b4c75110276b5e8527/net/core/request_sock.c#L19-L31
  #backlog = 128;

  constructor(socketId, addressFamily) {
    super();
    this.id = socketId;
    this.#socketOptions.family = addressFamily;
    this.#socketOptions.keepAlive = false;
    this.#socketOptions.noDelay = false;

    this.#clientHandle = new TCP(TCPConstants.SOCKET);
    this.#serverHandle = new TCP(TCPConstants.SERVER);
    this._handle = this.#serverHandle;
    this._handle.onconnection = this.#handleConnection.bind(this);
  }

  server() {
    return this.#serverHandle;
  }
  client() {
    return this.#clientHandle;
  }

  #handleConnection(err, clientHandle) {
    console.log(`[tcp] on server connection`);

    if (err) {
      throw new Error(err);
    }

    const socket = new NodeSocket({ handle: clientHandle });
    this.#connections++;

    // reserved
    socket.server = this.#serverHandle;
    socket._server = this.#serverHandle;

    this.emit("connection", socket);

    socket._handle.onread = (nread, buffer) => {
      if (nread > 0) {
        // TODO: handle data received from the client
        const data = buffer.toString("utf8", 0, nread);
        console.log("Received data:", data);
      }
    };
    socket._handle.readStart();
  }

  onClientConnectComplete(err) {
    console.log(`[tcp] on client connect complete`);

    if (err) {
      assert(err === -99, "ephemeral-ports-exhausted");
      assert(err === -104, "connection-reset");
      assert(err === -110, "timeout");
      assert(err === -111, "connection-refused");
      assert(err === -113, "remote-unreachable");
      assert(err === -125, "operation-cancelled");

      throw new Error(err);
    }

    this.#state = "connected";
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {Network} network
   * @param {IpSocketAddress} localAddress
   * @returns {void}
   * @throws {address-family-mismatch} The `local-address` has the wrong address family. (EINVAL)
   * @throws {already-bound} The socket is already bound. (EINVAL)
   * @throws {concurrency-conflict} Another `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   **/
  startBind(tcpSocket, network, localAddress) {
    console.log(
      `[tcp] start bind socket ${tcpSocket.id} to ${localAddress.val.address}:${localAddress.val.port}`
    );

    assert(this.#isBound, "already-bound");
    assert(this.#inProgress, "concurrency-conflict");

    const address = serializeIpAddress(
      localAddress,
      this.#socketOptions.family
    );
    const ipFamily = `ipv${isIP(address)}`;
    assert(
      this.#socketOptions.family.toLocaleLowerCase() !==
        ipFamily.toLocaleLowerCase(),
      "address-family-mismatch"
    );

    const { port } = localAddress.val;
    this.#socketOptions.localAddress = address;
    this.#socketOptions.localPort = port;
    this.network = network;
    this.#inProgress = true;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * @throws {ephemeral-ports-exhausted} No ephemeral ports available. (EADDRINUSE, ENOBUFS on Windows)
   * @throws {address-in-use} Address is already in use. (EADDRINUSE)
   * @throws {address-not-bindable} `local-address` is not an address that the `network` can bind to. (EADDRNOTAVAIL)
   * @throws {not-in-progress} A `bind` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   **/
  finishBind(tcpSocket) {
    console.log(`[tcp] finish bind socket ${tcpSocket.id}`);

    assert(this.#inProgress === false, "not-in-progress");

    const { localAddress, localPort, family } = this.#socketOptions;
    assert(isIP(localAddress) === 0, "address-not-bindable");

    const err = this.#serverHandle.bind(localAddress, localPort, family);
    if (err) {
      this.#serverHandle.close();
      console.error(`[tcp] error on socket ${tcpSocket.id}: ${err}`);
      this.#state = "error";
    }

    console.log(
      `[tcp] bound socket ${tcpSocket.id} to ${localAddress}:${localPort}`
    );

    this.#isBound = true;
    this.#inProgress = false;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {Network} network
   * @param {IpSocketAddress} remoteAddress
   * @returns {void}
   * @throws {address-family-mismatch} The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * @throws {invalid-remote-address} The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EADDRNOTAVAIL on Windows)
   * @throws {invalid-remote-port} The port in `remote-address` is set to 0. (EADDRNOTAVAIL on Windows)
   * @throws {already-attached} The socket is already attached to a different network. The `network` passed to `connect` must be identical to the one passed to `bind`.
   * @throws {already-connected} The socket is already in the Connection state. (EISCONN)
   * @throws {already-listening} The socket is already in the Listener state. (EOPNOTSUPP, EINVAL on Windows)
   * @throws {concurrency-conflict} Another `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  startConnect(tcpSocket, network, remoteAddress) {
    console.log(
      `[tcp] start connect socket ${tcpSocket.id} to ${remoteAddress.val.address}:${remoteAddress.val.port}`
    );

    assert(
      this.network !== null && this.network.id !== network.id,
      "already-attached"
    );
    assert(this.#state === "connected", "already-connected");
    assert(this.#state === "connection", "already-listening");
    assert(this.#inProgress, "concurrency-conflict");

    const host = serializeIpAddress(remoteAddress, this.#socketOptions.family);
    const ipFamily = `ipv${isIP(host)}`;

    assert(ipFamily.toLocaleLowerCase() === "ipv0", "invalid-remote-address");
    assert(
      this.#socketOptions.family.toLocaleLowerCase() !==
        ipFamily.toLocaleLowerCase(),
      "address-family-mismatch"
    );

    this.network = network;
    this.#socketOptions.remoteAddress = host;
    this.#socketOptions.remotePort = remoteAddress.val.port;

    this.#inProgress = true;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Array<InputStream, OutputStream>}
   * @throws {timeout} Connection timed out. (ETIMEDOUT)
   * @throws {connection-refused} The connection was forcefully rejected. (ECONNREFUSED)
   * @throws {connection-reset} The connection was reset. (ECONNRESET)
   * @throws {remote-unreachable} The remote address is not reachable. (EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * @throws {ephemeral-ports-exhausted} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE, EADDRNOTAVAIL on Linux, EAGAIN on BSD)
   * @throws {not-in-progress} A `connect` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   * */
  finishConnect(tcpSocket) {
    console.log(`[tcp] finish connect socket ${tcpSocket.id}`);

    assert(this.#inProgress === false, "not-in-progress");

    const { localAddress, localPort, remoteAddress, remotePort } =
      this.#socketOptions;
    const connectReq = new TCPConnectWrap();
    const err = this.#clientHandle.connect(
      connectReq,
      remoteAddress,
      remotePort
    );

    if (err) {
      console.error(`[tcp] error on socket ${tcpSocket.id}: ${err}`);
      this.#state = "error";
    }

    connectReq.oncomplete = this.onClientConnectComplete.bind(this);
    connectReq.address = remoteAddress;
    connectReq.port = remotePort;
    connectReq.localAddress = localAddress;
    connectReq.localPort = localPort;

    this.#clientHandle.onread = (buffer) => {
      // TODO: handle data received from the server

      console.log({
        buffer,
      });
    };
    this.#clientHandle.readStart();
    this.#inProgress = false;

    // TODO: return InputStream and OutputStream
    return [];
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * @throws {not-bound} The socket is not bound to any local address. (EDESTADDRREQ)
   * @throws {already-connected} The socket is already in the Connection state. (EISCONN, EINVAL on BSD)
   * @throws {already-listening} The socket is already in the Listener state.
   * @throws {concurrency-conflict} Another `bind`, `connect` or `listen` operation is already in progress. (EINVAL on BSD)
   * */
  startListen(tcpSocket) {
    console.log(
      `[tcp] start listen socket ${tcpSocket.id} on ${
        this.#socketOptions.localAddress
      }:${this.#socketOptions.localPort}`
    );

    assert(this.#isBound === false, "not-bound");
    assert(this.#state === "connected", "already-connected");
    assert(this.#state === "connection", "already-listening");
    assert(this.#inProgress, "concurrency-conflict");

    this.#inProgress = true;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * @throws {ephemeral-ports-exhausted} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
   * @throws {not-in-progress} A `listen` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   * */
  finishListen(tcpSocket) {
    console.log(
      `[tcp] finish listen socket ${tcpSocket.id} (backlog: ${this.#backlog})`
    );

    assert(this.#inProgress === false, "not-in-progress");

    const err = this.#serverHandle.listen(this.#backlog);
    if (err) {
      console.error(`[tcp] error on socket ${tcpSocket.id}: ${err}`);
      this.#serverHandle.close();
      throw new Error(err);
    }

    this.#inProgress = false;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Array<TcpSocket, InputStream, OutputStream>}
   * @throws {not-listening} Socket is not in the Listener state. (EINVAL)
   * @throws {would-block} No pending connections at the moment. (EWOULDBLOCK, EAGAIN)
   * */
  accept(tcpSocket) {
    console.log(`[tcp] accept socket ${tcpSocket.id}`);

    assert(this.#state !== "listening", "not-listening");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpSocketAddress}
   * @throws {not-bound} The socket is not bound to any local address.
   * */
  localAddress(tcpSocket) {
    console.log(`[tcp] local address socket ${tcpSocket.id}`);

    assert(this.#isBound === false, "not-bound");

    const { localAddress, localPort, family } = this.#socketOptions;
    return {
      tag: family,
      val: {
        address: deserializeIpAddress(localAddress, family),
        port: localPort,
      },
    };
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpSocketAddress}
   * @throws {not-connected} The socket is not connected to a remote address. (ENOTCONN)
   * */
  remoteAddress(tcpSocket) {
    console.log(`[tcp] remote address socket ${tcpSocket.id}`);

    assert(this.#isBound === false, "not-bound");
    assert(this.#state !== "connected", "not-connected");

    return this.#socketOptions.remoteAddress;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpAddressFamily}
   * */
  addressFamily(tcpSocket) {
    console.log(`[tcp] address family socket ${tcpSocket.id}`);

    return this.#socketOptions.family;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * @throws {ipv6-only-operation} (get/set) `this` socket is an IPv4 socket.

   * */
  ipv6Only(tcpSocket) {
    console.log(`[tcp] ipv6 only socket ${this.id}`);

    return this.#ipv6Only;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {boolean} value
   * @returns {void}
   * @throws {ipv6-only-operation} (get/set) `this` socket is an IPv4 socket.
   * @throws {already-bound} (set) The socket is already bound.
   * @throws {not-supported} (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  setIpv6Only(tcpSocket, value) {
    console.log(`[tcp] set ipv6 only socket ${tcpSocket.id} to ${value}`);

    this.#ipv6Only = value;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {bigint} value
   * @returns {void}
   * @throws {already-connected} (set) The socket is already in the Connection state.
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  setListenBacklogSize(tcpSocket, value) {
    console.log(
      `[tcp] set listen backlog size socket ${tcpSocket.id} to ${value}`
    );

    this.#backlog = value;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * */
  keepAlive(tcpSocket) {
    console.log(`[tcp] keep alive socket ${tcpSocket.id}`);

    this.#socketOptions.keepAlive;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {boolean} value
   * @returns {void}
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  setKeepAlive(tcpSocket, value) {
    console.log(`[tcp] set keep alive socket ${tcpSocket.id} to ${value}`);

    this.#socketOptions.keepAlive = value;
    this.#clientHandle.setKeepAlive(value);
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * */
  noDelay(tcpSocket) {
    console.log(`[tcp] no delay socket ${tcpSocket.id}`);

    return this.#socketOptions.noDelay;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {boolean} value
   * @returns {void}
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  setNoDelay(tcpSocket, value) {
    console.log(`[tcp] set no delay socket ${tcpSocket.id} to ${value}`);

    this.#socketOptions.noDelay = value;
    this.#serverHandle.setNoDelay(value);
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  unicastHopLimit(tcpSocket) {
    console.log(`[tcp] unicast hop limit socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {number} value
   * @returns {void}
   * @throws {already-connected} (set) The socket is already in the Connection state.
   * @throws {already-listening} (set) The socket is already in the Listener state.
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)

   * */
  setUnicastHopLimit(tcpSocket, value) {
    console.log(
      `[tcp] set unicast hop limit socket ${tcpSocket.id} to ${value}`
    );
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {bigint}
   * */
  receiveBufferSize(tcpSocket) {
    console.log(`[tcp] receive buffer size socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {bigint} value
   * @returns {void}
   * @throws {already-connected} (set) The socket is already in the Connection state.
   * @throws {already-listening} (set) The socket is already in the Listener state.
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  setReceiveBufferSize(tcpSocket, value) {
    console.log(`[tcp] set receive buffer size socket ${this.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {bigint}
   * */
  sendBufferSize(tcpSocket) {
    console.log(`[tcp] send buffer size socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {bigint} value
   * @returns {void}
   * @throws {already-connected} (set) The socket is already in the Connection state.
   * @throws {already-listening} (set) The socket is already in the Listener state.
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  setSendBufferSize(tcpSocket, value) {
    console.log(
      `[tcp] set send buffer size socket ${tcpSocket.id} to ${value}`
    );
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Pollable}
   * */
  subscribe(tcpSocket) {
    console.log(`[tcp] subscribe socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {ShutdownType} shutdownType
   * @returns {void}
   * @throws {not-connected} The socket is not in the Connection state. (ENOTCONN)
   * */
  shutdown(tcpSocket, shutdownType) {
    console.log(`[tcp] shutdown socket ${tcpSocket.id} with ${shutdownType}`);

    assert(this.#state !== "connected", "not-connected");

    if (shutdownType === "read") {
      this.#canReceive = false;
    } else if (shutdownType === "write") {
      this.#canSend = false;
    } else if (shutdownType === "both") {
      this.#canReceive = false;
      this.#canSend = false;
    }

    const req = new ShutdownWrap();
    req.oncomplete = this.#afterShutdown.bind(this);
    req.handle = this._handle;
    req.callback = () => {};
    const err = this._handle.shutdown(req);

    assert(err === 1, "not-connected");
  }

  #afterShutdown() {
    console.log(`[tcp] after shutdown socket ${this.id}`);
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * */
  dropTcpSocket(tcpSocket) {
    console.log(`[tcp] drop socket ${tcpSocket.id}`);

    this._handle.close();
    this._handle = null;
    this.#serverHandle.close();
    this.#clientHandle.close();
  }
}
