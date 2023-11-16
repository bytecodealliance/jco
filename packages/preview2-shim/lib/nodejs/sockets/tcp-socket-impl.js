/* eslint-disable no-unused-vars */

/**
 * @typedef {import("../../../types/interfaces/wasi-sockets-network.js").Network} Network
 * @typedef {import("../../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").TcpSocket} TcpSocket
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").InputStream} InputStream
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").OutputStream} OutputStream
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../../types/interfaces/wasi-io-poll-poll").Pollable} Pollable
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").ShutdownType} ShutdownType
 * @typedef {import("../../../types/interfaces/wasi-clocks-monotonic-clock.js").Duration} Duration
 */

import { streams } from "../io.js";
const { InputStream, OutputStream } = streams;
import { assert } from "../../common/assert.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const { TCP, TCPConnectWrap, constants: TCPConstants } = process.binding("tcp_wrap");
const { ShutdownWrap } = process.binding("stream_wrap");
import { isIP, Socket as NodeSocket } from "node:net";

import { serializeIpAddress, deserializeIpAddress } from "./socket-common.js";

const ShutdownType = {
  receive: "receive",
  send: "send",
  both: "both",
};

const SocketState = {
  Error: "Error",
  Closed: "Closed",
  Connection: "Connection",
  Listener: "Listener",
};

// TODO: implement would-block exceptions
// TODO: implement concurrency-conflict exceptions
export class TcpSocketImpl {
  /** @type {TCP.TCPConstants.SERVER} */ #serverHandle = null;
  /** @type {TCP.TCPConstants.SOCKET} */ #clientHandle = null;
  /** @type {Network} */ network = null;

  #isBound = false;
  #socketOptions = {};
  #canReceive = true;
  #canSend = true;
  #ipv6Only = false;
  #state = SocketState.Closed;
  #inProgress = false;
  #connections = 0;
  #keepAlive = false;
  #keepAliveCount = 1;
  #keepAliveIdleTime = 1;
  #keepAliveInterval = 1;
  #unicastHopLimit = 10;
  #acceptedClient = null;

  // See: https://github.com/torvalds/linux/blob/fe3cfe869d5e0453754cf2b4c75110276b5e8527/net/core/request_sock.c#L19-L31
  #backlog = 128;

  /**
   * @param {IpAddressFamily} addressFamily
   * @returns
   */
  constructor(addressFamily) {
    this.#socketOptions.family = addressFamily;

    this.#clientHandle = new TCP(TCPConstants.SOCKET);
    this.#serverHandle = new TCP(TCPConstants.SERVER);
    this._handle = this.#serverHandle;
    this._handle.onconnection = this.#handleConnection.bind(this);
    this._handle.onclose = this.#handleDisconnect.bind(this);
  }

  #handleConnection(err, newClientSocket) {
    if (err) {
      assert(true, "", err);
    }

    this.#acceptedClient = new NodeSocket({ handle: newClientSocket });
    this.#connections++;
    // reserved
    this.#acceptedClient.server = this.#serverHandle;
    this.#acceptedClient._server = this.#serverHandle;
    this.#acceptedClient._handle.onread = (nread, buffer) => {
      if (nread > 0) {
        // TODO: handle data received from the client
        const data = buffer.toString("utf8", 0, nread);
        console.log("accepted socket on read:", data);
      }
    };
  }

  #handleDisconnect(err) {}

  #onClientConnectComplete(err) {
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

  // TODO: is this needed?
  #handleAfterShutdown() {}

  /**
   * @param {Network} network
   * @param {IpSocketAddress} localAddress
   * @returns {void}
   * @throws {invalid-argument} The `local-address` has the wrong address family. (EAFNOSUPPORT, EFAULT on Windows)
   * @throws {invalid-argument} `local-address` is not a unicast address. (EINVAL)
   * @throws {invalid-argument} `local-address` is an IPv4-mapped IPv6 address, but the socket has `ipv6-only` enabled. (EINVAL)
   * @throws {invalid-state} The socket is already bound. (EINVAL)
   */
  startBind(network, localAddress) {
    const address = serializeIpAddress(localAddress, this.#socketOptions.family);
    const ipFamily = `ipv${isIP(address)}`;

    assert(this.#isBound, "invalid-state", "The socket is already bound");
    assert(
      this.#socketOptions.family.toLocaleLowerCase() !== ipFamily.toLocaleLowerCase(),
      "invalid-argument",
      "The `local-address` has the wrong address family"
    );

    // TODO: assert localAddress is not an unicast address
    assert(
      ipFamily.toLocaleLowerCase() === "ipv4" && this.ipv6Only(),
      "invalid-argument",
      "`local-address` is an IPv4-mapped IPv6 address, but the socket has `ipv6-only` enabled."
    );

    const { port } = localAddress.val;
    this.#socketOptions.localAddress = address;
    this.#socketOptions.localPort = port;
    this.network = network;
    this.#inProgress = true;
  }

  /**
   * @returns {void}
   * @throws {address-in-use} No ephemeral ports available. (EADDRINUSE, ENOBUFS on Windows)
   * @throws {address-in-use} Address is already in use. (EADDRINUSE)
   * @throws {address-not-bindable} `local-address` is not an address that the `network` can bind to. (EADDRNOTAVAIL)
   * @throws {not-in-progress} A `bind` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   **/
  finishBind() {
    assert(this.#inProgress === false, "not-in-progress");

    const { localAddress, localPort, family } = this.#socketOptions;
    assert(isIP(localAddress) === 0, "address-not-bindable");

    let err = null;
    if (family.toLocaleLowerCase() === "ipv4") {
      err = this.#serverHandle.bind(localAddress, localPort);
    } else if (family.toLocaleLowerCase() === "ipv6") {
      err = this.#serverHandle.bind6(localAddress, localPort);
    }

    if (err) {
      this.#serverHandle.close();
      assert(err === -22, "address-in-use");
      assert(err === -49, "address-not-bindable");
      assert(err === -99, "address-not-bindable"); // EADDRNOTAVAIL
      assert(true, "", err);
    }

    this.#isBound = true;
    this.#inProgress = false;
  }

  /**
   * @param {Network} network
   * @param {IpSocketAddress} remoteAddress
   * @returns {void}
   * @throws {invalid-argument} The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * @throws {invalid-argument} `remote-address` is not a unicast address. (EINVAL, ENETUNREACH on Linux, EAFNOSUPPORT on MacOS)
   * @throws {invalid-argument} `remote-address` is an IPv4-mapped IPv6 address, but the socket has `ipv6-only` enabled. (EINVAL, EADDRNOTAVAIL on Illumos)
   * @throws {invalid-argument} `remote-address` is a non-IPv4-mapped IPv6 address, but the socket was bound to a specific IPv4-mapped IPv6 address. (or vice versa)
   * @throws {invalid-argument} The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EADDRNOTAVAIL on Windows)
   * @throws {invalid-argument} The port in `remote-address` is set to 0. (EADDRNOTAVAIL on Windows)
   * @throws {invalid-argument} The socket is already attached to a different network. The `network` passed to `connect` must be identical to the one passed to `bind`.
   * @throws {invalid-state} The socket is already in the Connection state. (EISCONN)
   * @throws {invalid-state} The socket is already in the Listener state. (EOPNOTSUPP, EINVAL on Windows)
   */
  startConnect(network, remoteAddress) {
    assert(this.network !== null && this.network.id !== network.id, "already-attached");
    assert(this.#state === "connected", "already-connected");
    assert(this.#state === "connection", "already-listening");
    assert(this.#inProgress, "concurrency-conflict");

    const host = serializeIpAddress(remoteAddress, this.#socketOptions.family);
    const ipFamily = `ipv${isIP(host)}`;

    assert(ipFamily.toLocaleLowerCase() === "ipv0", "invalid-remote-address");
    assert(this.#socketOptions.family.toLocaleLowerCase() !== ipFamily.toLocaleLowerCase(), "address-family-mismatch");

    this.#socketOptions.remoteAddress = host;
    this.#socketOptions.remotePort = remoteAddress.val.port;

    this.network = network;
    this.#inProgress = true;
  }

  /**
   * @returns {Array<InputStream, OutputStream>}
   * @throws {timeout} Connection timed out. (ETIMEDOUT)
   * @throws {connection-refused} The connection was forcefully rejected. (ECONNREFUSED)
   * @throws {connection-reset} The connection was reset. (ECONNRESET)
   * @throws {connection-aborted} The connection was aborted. (ECONNABORTED)
   * @throws {remote-unreachable} The remote address is not reachable. (EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE, EADDRNOTAVAIL on Linux, EAGAIN on BSD)
   * @throws {not-in-progress} A `connect` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   */
  finishConnect() {
    assert(this.#inProgress === false, "not-in-progress");

    const { localAddress, localPort, remoteAddress, remotePort, family } = this.#socketOptions;
    const connectReq = new TCPConnectWrap();

    let err = null;
    if (family.toLocaleLowerCase() === "ipv4") {
      err = this.#clientHandle.connect(connectReq, remoteAddress, remotePort);
    } else if (family.toLocaleLowerCase() === "ipv6") {
      err = this.#clientHandle.connect6(connectReq, remoteAddress, remotePort);
    }

    if (err) {
      console.error(`[tcp] connect error on socket: ${err}`);
      this.#state = SocketState.Error;
    }

    connectReq.oncomplete = this.#onClientConnectComplete.bind(this);
    connectReq.address = remoteAddress;
    connectReq.port = remotePort;
    connectReq.localAddress = localAddress;
    connectReq.localPort = localPort;

    this.#clientHandle.onread = (buffer) => {
      // TODO: handle data received from the server
    };

    this.#clientHandle.readStart();
    this.#inProgress = false;

    // TODO: return InputStream and OutputStream
    return [];
  }

  /**
   * @returns {void}
   * @throws {invalid-state} The socket is not bound to any local address. (EDESTADDRREQ)
   * @throws {invalid-state} The socket is already in the Connection state. (EISCONN, EINVAL on BSD)
   * @throws {invalid-state} The socket is already in the Listener state.
   */
  startListen() {
    assert(this.#isBound === false, "invalid-state");
    assert(this.#state === SocketState.Connection, "invalid-state");
    assert(this.#state === SocketState.Listener, "invalid-state");

    this.#inProgress = true;
  }

  /**
   * @returns {void}
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
   * @throws {not-in-progress} A `listen` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   */
  finishListen() {
    assert(this.#inProgress === false, "not-in-progress");

    const err = this.#serverHandle.listen(this.#backlog);
    if (err) {
      console.error(`[tcp] listen error on socket: ${err}`);
      this.#serverHandle.close();
      throw new Error(err);
    }

    this.#inProgress = false;
  }

  /**
   * @returns {Array<TcpSocket, InputStream, OutputStream>}
   * @throws {invalid-state} Socket is not in the Listener state. (EINVAL)
   * @throws {would-block} No pending connections at the moment. (EWOULDBLOCK, EAGAIN)
   * @throws {connection-aborted} An incoming connection was pending, but was terminated by the client before this listener could accept it. (ECONNABORTED)
   * @throws {new-socket-limit} The new socket resource could not be created because of a system limit. (EMFILE, ENFILE)
   */
  accept() {
    // uv_accept is automatically called by uv_listen when a new connection is received.

    const self = this;
    const outgoingStream = new OutputStream({
      write(bytes) {
        self.#acceptedClient.write(bytes);
      },
    });
    const ingoingStream = new InputStream({
      read(len) {
        return self.#acceptedClient.read(len);
      },
    });

    return [this.#acceptedClient, ingoingStream, outgoingStream];
  }

  /**
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    assert(this.#isBound === false, "invalid-state");

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
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not connected to a remote address. (ENOTCONN)
   */
  remoteAddress() {
    assert(this.#state !== SocketState.Connection, "invalid-state");

    return this.#socketOptions.remoteAddress;
  }

  isListening() {
    return this.#state === SocketState.Listener;
  }

  /**
   * @returns {IpAddressFamily}
   */
  addressFamily() {
    return this.#socketOptions.family;
  }

  /**
   * @returns {boolean}
   * @throws {not-supported} (get/set) `this` socket is an IPv4 socket.
   */
  ipv6Only() {
    return this.#ipv6Only;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   * @throws {invalid-state} (set) The socket is already bound.
   * @throws {invalid-state} (get/set) `this` socket is an IPv4 socket.
   * @throws {not-supported} (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   */
  setIpv6Only(value) {
    this.#ipv6Only = value;
  }

  /**
   * @param {bigint} value
   * @returns {void}
   * @throws {not-supported} (set) The platform does not support changing the backlog size after the initial listen.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   */
  setListenBacklogSize(value) {
    this.#backlog = value;
  }

  /**
   * @returns {boolean}
   */
  keepAliveEnabled() {
    this.#keepAlive;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   */
  setKeepAliveEnabled(value) {
    this.#keepAlive = value;
    this.#clientHandle.setKeepAlive(value);

    if (value) {
      this.#clientHandle.setKeepAliveIdleTime(this.keepAliveIdleTime());
      this.#clientHandle.setKeepAliveInterval(this.keepAliveInterval());
      this.#clientHandle.setKeepAliveCount(this.keepAliveCount());
    }
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveIdleTime() {
    return this.#keepAliveIdleTime;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The idle time must be 1 or higher.
   */
  setKeepAliveIdleTime(value) {
    assert(value < 1, "invalid-argument", "The idle time must be 1 or higher.");

    this.#keepAliveIdleTime = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveInterval() {
    return this.#keepAliveInterval;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The interval must be 1 or higher.
   */
  setKeepAliveInterval(value) {
    assert(value < 1, "invalid-argument", "The interval must be 1 or higher.");

    this.#keepAliveInterval = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveCount() {
    return this.#keepAliveCount;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The count must be 1 or higher.
   */
  setKeepAliveCount(value) {
    assert(value < 1, "invalid-argument", "The count must be 1 or higher.");

    this.#keepAliveCount = value;
  }

  /**
   * @returns {number}
   */
  unicastHopLimit() {
    return this.#unicastHopLimit;
  }

  /**
   * @param {number} value
   * @returns {void}
   * @throws {invalid-argument} (set) The TTL value must be 1 or higher.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   * @throws {invalid-state} (set) The socket is already in the Listener state.
   */
  setUnicastHopLimit(value) {
    this.#unicastHopLimit = value;
  }

  /**
   * @returns {bigint}
   */
  receiveBufferSize() {
    throw new Error("not implemented");
  }

  /**
   * @param {number} value
   * @returns {void}
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   * @throws {invalid-state} (set) The socket is already in the Listener state.
   */
  setReceiveBufferSize(value) {
    throw new Error("not implemented");
  }

  /**
   * @returns {bigint}
   */
  sendBufferSize() {
    throw new Error("not implemented");
  }

  /**
   * @param {bigint} value
   * @returns {void}
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   * @throws {invalid-state} (set) The socket is already in the Listener state.
   */
  setSendBufferSize(value) {
    throw new Error("not implemented");
  }

  /**
   * @returns {Pollable}
   */
  subscribe() {
    throw new Error("not implemented");
  }

  /**
   * @param {ShutdownType} shutdownType
   * @returns {void}
   * @throws {invalid-state} The socket is not in the Connection state. (ENOTCONN)
   */
  shutdown(shutdownType) {
    // TODO: figure out how to handle shutdownTypes
    if (shutdownType === ShutdownType.receive) {
      this.#canReceive = false;
    } else if (shutdownType === ShutdownType.send) {
      this.#canSend = false;
    } else if (shutdownType === ShutdownType.both) {
      this.#canReceive = false;
      this.#canSend = false;
    }

    const req = new ShutdownWrap();
    req.oncomplete = this.#handleAfterShutdown.bind(this);
    req.handle = this._handle;
    req.callback = () => {};
    const err = this._handle.shutdown(req);

    assert(err === 1, "invalid-state");
  }

  [symbolDispose]() {
    this.#serverHandle.close();
    this.#clientHandle.close();
  }

  server() {
    return this.#serverHandle;
  }
  client() {
    return this.#clientHandle;
  }
}
