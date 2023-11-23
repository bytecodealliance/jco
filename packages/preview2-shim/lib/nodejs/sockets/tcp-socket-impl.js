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

import { isIP, Socket as NodeSocket } from "node:net";
import { assert } from "../../common/assert.js";
import { streams } from "../io.js";
const { InputStream, OutputStream } = streams;

const symbolDispose = Symbol.dispose || Symbol.for("dispose");
const symbolState = Symbol("SocketInternalState");

// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const {
  TCP,
  TCPConnectWrap,
  constants: TCPConstants,
} = process.binding("tcp_wrap");
const { ShutdownWrap } = process.binding("stream_wrap");

import {
  SOCKET_INPUT_STREAM,
  SOCKET_OUTPUT_STREAM,
} from "../../io/stream-types.js";
import {
  inputStreamCreate,
  outputStreamCreate,
  pollableCreate,
} from "../../io/worker-io.js";
import { deserializeIpAddress, serializeIpAddress } from "./socket-common.js";

// TODO: move to a common
const ShutdownType = {
  receive: "receive",
  send: "send",
  both: "both",
};

// TODO: move to a common
const SocketConnectionState = {
  Error: "Error",
  Closed: "Closed",
  Connecting: "Connecting",
  Connected: "Connected",
  Listening: "Listening",
};

// TODO: implement would-block exceptions
// TODO: implement concurrency-conflict exceptions
export class TcpSocketImpl {
  /** @type {TCP.TCPConstants.SERVER} */ #serverHandle = null;
  /** @type {TCP.TCPConstants.SOCKET} */ #clientHandle = null;
  /** @type {Network} */ network = null;

  #socketOptions = {};
  #connections = 0;

  #pollId = null;

  [symbolState] = {
    isBound: false,
    operationInProgress: false,
    ipv6Only: false,
    state: SocketConnectionState.Closed,
    acceptedClient: null,
    canReceive: true,
    canSend: true,

    // TODO: what these default values should be?
    backlogSize: 1,
    keepAlive: false,
    keepAliveCount: 1,
    keepAliveIdleTime: 1,
    keepAliveInterval: 1,
    hopLimit: 1,
    receiveBufferSize: 1,
    sendBufferSize: 1,
  };

  // See: https://github.com/torvalds/linux/blob/fe3cfe869d5e0453754cf2b4c75110276b5e8527/net/core/request_sock.c#L19-L31
  #backlog = 128;
c
  // this is set by the TcpSocket child class
  tcpSocketChildClassType = null;

  /**
   * @param {IpAddressFamily} addressFamily
   * @param {TcpSocket} childClassType
   * @returns
   */
  constructor(addressFamily, childClassType) {
    this.#socketOptions.family = addressFamily;
    this.tcpSocketChildClassType = childClassType;

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

    this[symbolState].acceptedClient = new NodeSocket({
      handle: newClientSocket,
    });
    this.#connections++;
    // reserved
    this[symbolState].acceptedClient.server = this.#serverHandle;
    this[symbolState].acceptedClient._server = this.#serverHandle;
    this[symbolState].acceptedClient._handle.onread = (nread, buffer) => {
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

    this[symbolState].state = "connected";
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
    const address = serializeIpAddress(
      localAddress,
      this.#socketOptions.family
    );
    const ipFamily = `ipv${isIP(address)}`;

    assert(
      this[symbolState].isBound,
      "invalid-state",
      "The socket is already bound"
    );
    assert(
      this.#socketOptions.family.toLocaleLowerCase() !==
        ipFamily.toLocaleLowerCase(),
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
    this[symbolState].operationInProgress = true;
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
    assert(this[symbolState].operationInProgress === false, "not-in-progress");

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
      assert(true, "unknown", err);
    }

    this[symbolState].isBound = true;
    this[symbolState].operationInProgress = false;
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
    assert(
      this.network !== null && this.network.id !== network.id,
      "already-attached"
    );
    assert(this[symbolState].state === "connected", "already-connected");
    assert(this[symbolState].state === "connection", "already-listening");
    assert(this[symbolState].operationInProgress, "concurrency-conflict");

    const host = serializeIpAddress(remoteAddress, this.#socketOptions.family);
    const ipFamily = `ipv${isIP(host)}`;

    assert(ipFamily.toLocaleLowerCase() === "ipv0", "invalid-remote-address");
    assert(
      this.#socketOptions.family.toLocaleLowerCase() !==
        ipFamily.toLocaleLowerCase(),
      "address-family-mismatch"
    );

    this.#socketOptions.remoteAddress = host;
    this.#socketOptions.remotePort = remoteAddress.val.port;

    this.network = network;
    this[symbolState].operationInProgress = true;
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
    assert(this[symbolState].operationInProgress === false, "not-in-progress");

    const { localAddress, localPort, remoteAddress, remotePort, family } =
      this.#socketOptions;
    const connectReq = new TCPConnectWrap();

    let err = null;
    let connect = "connect";
    if (family.toLocaleLowerCase() === "ipv4") {
      connect = "connect";
    } else if (family.toLocaleLowerCase() === "ipv6") {
      connect = "connect6";
    }

    err = this.#clientHandle[connect](connectReq, remoteAddress, remotePort);

    if (err) {
      console.error(`[tcp] connect error on socket: ${err}`);
      this[symbolState].state = SocketConnectionState.Error;
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
    this[symbolState].operationInProgress = false;

    const streamId = this.#connections++;
    const inputStream = inputStreamCreate(SOCKET_INPUT_STREAM, streamId);
    const outputStream = outputStreamCreate(SOCKET_OUTPUT_STREAM, streamId);
    return [inputStream, outputStream];
  }

  /**
   * @returns {void}
   * @throws {invalid-state} The socket is not bound to any local address. (EDESTADDRREQ)
   * @throws {invalid-state} The socket is already in the Connection state. (EISCONN, EINVAL on BSD)
   * @throws {invalid-state} The socket is already in the Listener state.
   */
  startListen() {
    assert(this[symbolState].isBound === false, "invalid-state");
    assert(
      this[symbolState].state === SocketConnectionState.Connected,
      "invalid-state"
    );
    assert(
      this[symbolState].state === SocketConnectionState.Listener,
      "invalid-state"
    );

    this[symbolState].operationInProgress = true;
  }

  /**
   * @returns {void}
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
   * @throws {not-in-progress} A `listen` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   */
  finishListen() {
    assert(this[symbolState].operationInProgress === false, "not-in-progress");

    const err = this.#serverHandle.listen(this.#backlog);
    if (err) {
      console.error(`[tcp] listen error on socket: ${err}`);
      this.#serverHandle.close();

      // TODO: handle errors
      throw new Error(err);
    }

    this[symbolState].operationInProgress = false;
  }

  /**
   * @returns {Array<TcpSocket, InputStream, OutputStream>}
   * @throws {invalid-state} Socket is not in the Listener state. (EINVAL)
   * @throws {would-block} No pending connections at the moment. (EWOULDBLOCK, EAGAIN)
   * @throws {connection-aborted} An incoming connection was pending, but was terminated by the client before this listener could accept it. (ECONNABORTED)
   * @throws {new-socket-limit} The new socket resource could not be created because of a system limit. (EMFILE, ENFILE)
   */
  accept() {
    // because we have to return a valid TcpSocket type, we need to declare this method
    // on the child class, TcpSocket, and not here. Otherwise, we get:
    // Error: Resource error: Not a valid "TcpSocket" resource.
    const inputStream = inputStreamCreate(SOCKET_INPUT_STREAM, this.id);
    const outputStream = outputStreamCreate(SOCKET_OUTPUT_STREAM, this.id);

    /// The returned socket is bound and in the Connection state. The following properties are inherited from the listener socket:
    /// - `address-family`
    /// - `ipv6-only`
    /// - `keep-alive-enabled`
    /// - `keep-alive-idle-time`
    /// - `keep-alive-interval`
    /// - `keep-alive-count`
    /// - `hop-limit`
    /// - `receive-buffer-size`
    /// - `send-buffer-size`
    ///
    const socket = new this.tcpSocketChildClassType(this.addressFamily);
    socket.setIpv6Only(this.ipv6Only());
    socket.setKeepAliveEnabled(this.keepAliveEnabled());
    socket.setKeepAliveIdleTime(this.keepAliveIdleTime());
    socket.setKeepAliveInterval(this.keepAliveInterval());
    socket.setKeepAliveCount(this.keepAliveCount());
    socket.setHopLimit(this.hopLimit());
    socket.setReceiveBufferSize(this.receiveBufferSize());
    socket.setSendBufferSize(this.sendBufferSize());
    return [socket, inputStream, outputStream];
  }

  /**
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    assert(this[symbolState].isBound === false, "invalid-state");

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
    assert(
      this[symbolState].state !== SocketConnectionState.Connected,
      "invalid-state"
    );

    return this.#socketOptions.remoteAddress;
  }

  isListening() {
    return this[symbolState].state === SocketConnectionState.Listener;
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
    return this[symbolState].ipv6Only;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   * @throws {invalid-state} (set) The socket is already bound.
   * @throws {invalid-state} (get/set) `this` socket is an IPv4 socket.
   * @throws {not-supported} (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   */
  setIpv6Only(value) {
    this[symbolState].ipv6Only = value;
  }

  /**
   * @param {bigint} value
   * @returns {void}
   * @throws {not-supported} (set) The platform does not support changing the backlog size after the initial listen.
   * @throws {invalid-argument} (set) The provided value was 0.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   */
  setListenBacklogSize(value) {
    assert(value === 0n, "invalid-argument", "The provided value was 0.");
    assert(
      this[symbolState].state === SocketConnectionState.Connected,
      "invalid-state"
    );

    this[symbolState].backlogSize = value;
  }

  /**
   * @returns {boolean}
   */
  keepAliveEnabled() {
    return this[symbolState].keepAlive;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   */
  setKeepAliveEnabled(value) {
    this.#clientHandle.setKeepAlive(value);
    this[symbolState].keepAlive = value;

    if (value) {
      this.setKeepAliveIdleTime(this.keepAliveIdleTime());
      this.setKeepAliveInterval(this.keepAliveInterval());
      this.setKeepAliveCount(this.keepAliveCount());
    }
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveIdleTime() {
    return this[symbolState].keepAliveIdleTime;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The idle time must be 1 or higher.
   */
  setKeepAliveIdleTime(value) {
    assert(value < 1, "invalid-argument", "The idle time must be 1 or higher.");

    this[symbolState].keepAliveIdleTime = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveInterval() {
    return this[symbolState].keepAliveInterval;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The interval must be 1 or higher.
   */
  setKeepAliveInterval(value) {
    assert(value < 1, "invalid-argument", "The interval must be 1 or higher.");

    this[symbolState].keepAliveInterval = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveCount() {
    return this[symbolState].keepAliveCount;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The count must be 1 or higher.
   */
  setKeepAliveCount(value) {
    assert(value < 1, "invalid-argument", "The count must be 1 or higher.");

    // TODO: set this on the client socket as well
    this[symbolState].keepAliveCount = value;
  }

  /**
   * @returns {number}
   */
  hopLimit() {
    return this[symbolState].hopLimit;
  }

  /**
   * @param {number} value
   * @returns {void}
   * @throws {invalid-argument} (set) The TTL value must be 1 or higher.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   * @throws {invalid-state} (set) The socket is already in the Listener state.
   */
  setHopLimit(value) {
    assert(
      !value || value < 1,
      "invalid-argument",
      "The TTL value must be 1 or higher."
    );
    assert(
      this[symbolState].state === SocketConnectionState.Connected,
      "invalid-state"
    );

    // TODO: set this on the client socket as well
    this[symbolState].hopLimit = value;
  }

  /**
   * @returns {bigint}
   */
  receiveBufferSize() {
    return this[symbolState].receiveBufferSize;
  }

  /**
   * @param {number} value
   * @returns {void}
   * @throws {not-supported} (set) The platform does not support changing the backlog size after the initial listen.
   * @throws {invalid-argument} (set) The provided value was 0.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   */
  setReceiveBufferSize(value) {
    assert(value === 0n, "invalid-argument", "The provided value was 0.");
    assert(
      this[symbolState].state === SocketConnectionState.Connected,
      "invalid-state"
    );

    // TODO: set this on the client socket as well
    this[symbolState].receiveBufferSize = value;
  }

  /**
   * @returns {bigint}
   */
  sendBufferSize() {
    return this[symbolState].sendBufferSize;
  }

  /**
   * @param {bigint} value
   * @returns {void}
   * @throws {invalid-argument} (set) The provided value was 0.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   * @throws {invalid-state} (set) The socket is already in the Listener state.
   */
  setSendBufferSize(value) {
    assert(value === 0n, "invalid-argument", "The provided value was 0.");
    assert(
      this[symbolState].state === SocketConnectionState.Connected,
      "invalid-state"
    );

    // TODO: set this on the client socket as well
    this[symbolState].sendBufferSize = value;
  }

  /**
   * @returns {Pollable}
   */
  subscribe() {
    if (this.#pollId) return pollableCreate(this.#pollId);
    // 0 poll is immediately resolving
    return pollableCreate(0);
  }

  /**
   * @param {ShutdownType} shutdownType
   * @returns {void}
   * @throws {invalid-state} The socket is not in the Connection state. (ENOTCONN)
   */
  shutdown(shutdownType) {
    // TODO: figure out how to handle shutdownTypes
    if (shutdownType === ShutdownType.receive) {
      this[symbolState].canReceive = false;
    } else if (shutdownType === ShutdownType.send) {
      this[symbolState].canSend = false;
    } else if (shutdownType === ShutdownType.both) {
      this[symbolState].canReceive = false;
      this[symbolState].canSend = false;
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
