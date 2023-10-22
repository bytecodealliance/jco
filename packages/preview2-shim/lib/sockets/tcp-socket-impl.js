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

import { Socket as NodeSocket, SocketAddress as NodeSocketAddress, isIP } from "node:net";

function tupleToIPv6(arr) {
  if (arr.length !== 8) {
    return null; // Return null for invalid input
  }
  const ipv6Segments = arr.map((segment) => segment.toString(16));
  return ipv6Segments.join(":");
}

export class TcpSocketImpl {
  /** @type {number} */ id;
  /** @type {boolean} */ isBound = false;
  /** @type {NodeSocket} */ socket = null;
  /** @type {Network} */ network = null;
  /** @type {NodeSocketAddress} */ socketAddress = null;

  /** @type {IpAddressFamily} */ #addressFamily;
  #ipv6Only = false;
  #state = "closed";

  constructor(socketId, addressFamily) {
    this.id = socketId;
    this.#addressFamily = addressFamily;
    this.socket = new NodeSocket();
  }

  #computeIpAddress(localAddress) {
    let { address } = localAddress.val;
    if (this.#addressFamily.toLocaleLowerCase() === "ipv4") {
      address = address.join(".");
    } else if (this.#addressFamily.toLocaleLowerCase() === "ipv6") {
      address = tupleToIPv6(address);
    }

    return address;
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
    console.log(`[tcp] start bind socket ${tcpSocket.id}`);

    if (this.isBound) {
      throw new Error("already-bound");
    }

    const address = this.#computeIpAddress(localAddress);

    const ipFamily = `ipv${isIP(address)}`;
    if (this.#addressFamily.toLocaleLowerCase() !== ipFamily.toLocaleLowerCase()) {
      throw new Error("address-family-mismatch");
    }

    const { port } = localAddress.val;
    this.socketAddress = new NodeSocketAddress({
      address,
      port,
      family: this.#addressFamily,
    });

    this.network = network;
    this.isBound = true;
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

    this.network = null;
    this.socketAddress = null;
    this.isBound = false;
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
    console.log(`[tcp] start connect socket ${tcpSocket.id} to ${remoteAddress} on network ${network.id}`);

    if (this.network !== null && this.network.id !== network.id) {
      throw new Error("already-attached");
    }
    this.network = network;

    if (this.#state === "connected") {
      throw new Error("already-connected");
    }

    if (this.#state === "connection") {
      throw new Error("already-listening");
    }

    if (this.isBound === false) {
      throw new Error("not-bound");
    }

    const host = this.#computeIpAddress(remoteAddress);

    const ipFamily = `ipv${isIP(host)}`;
    if (ipFamily.toLocaleLowerCase() === "ipv0") {
      throw new Error("invalid-remote-address");
    }

    if (this.#addressFamily.toLocaleLowerCase() !== ipFamily.toLocaleLowerCase()) {
      throw new Error("address-family-mismatch");
    }

    this.socket.connect({
      localAddress: this.socketAddress.address,
      localPort: this.socketAddress.port,
      host,
      port: remoteAddress.val.port,
      family: this.#addressFamily,
    });

    this.socket.on("connect", () => {
      console.log(`[tcp] connect on socket ${tcpSocket.id}`);
      this.#state = "connected";
    });

    this.socket.on("ready", () => {
      console.log(`[tcp] ready on socket ${tcpSocket.id}`);
      this.#state = "connection";
    });

    this.socket.on("close", () => {
      console.log(`[tcp] close on socket ${tcpSocket.id}`);
      this.#state = "closed";
    });

    this.socket.on("end", () => {
      console.log(`[tcp] end on socket ${tcpSocket.id}`);
      this.#state = "closed";
    });

    this.socket.on("timeout", () => {
      console.error(`[tcp] timeout on socket ${tcpSocket.id}`);
      this.#state = "closed";
    });

    this.socket.on("error", (err) => {
      console.error(`[tcp] error on socket ${tcpSocket.id}: ${err}`);
      this.#state = "error";
    });
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

    this.socket.destroySoon();
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
    console.log(`[tcp] start listen socket ${tcpSocket.id}`);

    this.socket.listen();
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * @throws {ephemeral-ports-exhausted} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
   * @throws {not-in-progress} A `listen` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   * */
  finishListen(tcpSocket) {
    console.log(`[tcp] finish listen socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Array<TcpSocket, InputStream, OutputStream>}
   * @throws {not-listening} Socket is not in the Listener state. (EINVAL)
   * @throws {would-block} No pending connections at the moment. (EWOULDBLOCK, EAGAIN)
   * */
  accept(tcpSocket) {
    console.log(`[tcp] accept socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpSocketAddress}
   * @throws {not-bound} The socket is not bound to any local address.
   * */
  localAddress(tcpSocket) {
    console.log(`[tcp] local address socket ${tcpSocket.id}`);

    if (!this.isBound) {
      throw new Error("not-bound");
    }

    return this.socket.localAddress();
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpSocketAddress}
   * @throws {not-connected} The socket is not connected to a remote address. (ENOTCONN)
   * */
  remoteAddress(tcpSocket) {
    console.log(`[tcp] remote address socket ${tcpSocket.id}`);

    if (!this.isBound) {
      throw new Error("not-bound");
    }

    if (this.#state !== "connected") {
      throw new Error("not-connected");
    }

    return this.socket.remoteAddress();
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpAddressFamily}
   * */
  addressFamily(tcpSocket) {
    console.log(`[tcp] address family socket ${tcpSocket.id}`);

    return this.socket.localFamily;
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
    console.log(`[tcp] set listen backlog size socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * */
  keepAlive(tcpSocket) {
    console.log(`[tcp] keep alive socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {boolean} value
   * @returns {void}
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  setKeepAlive(tcpSocket, value) {
    console.log(`[tcp] set keep alive socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * */
  noDelay(tcpSocket) {
    console.log(`[tcp] no delay socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {boolean} value
   * @returns {void}
   * @throws {concurrency-conflict} (set) A `bind`, `connect` or `listen` operation is already in progress. (EALREADY)
   * */
  setNoDelay(tcpSocket, value) {
    console.log(`[tcp] set no delay socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
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
    console.log(`[tcp] set unicast hop limit socket ${tcpSocket.id} to ${value}`);
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
    console.log(`[tcp] set send buffer size socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Pollable}
   * */
  subscribe(tcpSocket) {
    console.log(`[tcp] subscribe socket ${this.id}`);
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
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * */
  dropTcpSocket(tcpSocket) {
    console.log(`[tcp] drop socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }
}
