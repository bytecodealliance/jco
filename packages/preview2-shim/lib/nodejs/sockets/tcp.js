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

import { platform } from "node:os";
import { mayTcp } from "./socket-common.js";

const isWindows = platform() === "win32";
const symbolDispose = Symbol.dispose || Symbol.for("dispose");

import {
  SOCKET,
  SOCKET_TCP_BIND,
  SOCKET_TCP_CONNECT,
  SOCKET_TCP_CREATE_HANDLE,
  SOCKET_TCP_CREATE_INPUT_STREAM,
  SOCKET_TCP_CREATE_OUTPUT_STREAM,
  SOCKET_TCP_DISPOSE,
  SOCKET_TCP_GET_LOCAL_ADDRESS,
  SOCKET_TCP_GET_REMOTE_ADDRESS,
  SOCKET_TCP_LISTEN,
  SOCKET_TCP_SET_KEEP_ALIVE,
} from "../../io/calls.js";
import {
  inputStreamCreate,
  ioCall,
  outputStreamCreate,
  pollableCreate,
} from "../../io/worker-io.js";
import {
  findUnusedLocalAddress,
  isIPv4MappedAddress,
  isMulticastIpAddress,
  isUnicastIpAddress,
  isWildcardAddress,
  serializeIpAddress,
} from "./socket-common.js";

let stateCnt = 0;
const SOCKET_STATE_INIT = ++stateCnt;
const SOCKET_STATE_ERROR = ++stateCnt;
const SOCKET_STATE_BIND = ++stateCnt;
const SOCKET_STATE_BOUND = ++stateCnt;
const SOCKET_STATE_LISTEN = ++stateCnt;
const SOCKET_STATE_LISTENER = ++stateCnt;
const SOCKET_STATE_CONNECT = ++stateCnt;
const SOCKET_STATE_CONNECTION = ++stateCnt;

const STATE_MASK = 0xff;

const SOCKET_STATE_OPEN = 3 << 8; // = READABLE | WRITABLE
const SOCKET_STATE_READABLE = 1 << 8;
const SOCKET_STATE_WRITABLE = 2 << 8;
const SOCKET_STATE_CLOSED = 4 << 8;

// As a workaround, we store the bound address in a global map
// this is needed because 'address-in-use' is not always thrown when binding
// more than one socket to the same address
// TODO: remove this workaround when we figure out why!
const globalBoundAddresses = new Map();

export class TcpSocket {
  #network;
  #id;

  #state = SOCKET_STATE_INIT;
  #error = null;

  #bindOrConnectAddress = null;

  // See: https://github.com/torvalds/linux/blob/fe3cfe869d5e0453754cf2b4c75110276b5e8527/net/core/request_sock.c#L19-L31
  #listenBacklogSize = 128;

  // these options are exactly the ones which copy on accept
  #options = {
    family: "ipv4",
    ipv6Only: false,
    // TODO: what these default values should be?
    keepAlive: false,
    keepAliveCount: 1,
    keepAliveIdleTime: 1,
    keepAliveInterval: 1,
    hopLimit: 1,
    receiveBufferSize: 1,
    sendBufferSize: 1,
  };

  #isBound() {
    return (
      this.#state === SOCKET_STATE_BOUND ||
      this.#state === SOCKET_STATE_LISTEN ||
      this.#state === SOCKET_STATE_CONNECT ||
      this.#state === SOCKET_STATE_LISTENER ||
      (this.#state & STATE_MASK) == SOCKET_STATE_CONNECTION
    );
  }

  /**
   * @param {IpAddressFamily} addressFamily
   * @returns {TcpSocket}
   */
  static _create(addressFamily) {
    if (addressFamily !== "ipv4" && addressFamily !== "ipv6")
      throw "not-supported";
    const socket = new TcpSocket();
    socket.#id = ioCall(SOCKET_TCP_CREATE_HANDLE, null, null);
    socket.#options.family = addressFamily;
    return socket;
  }

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
    if (!mayTcp(network)) throw "access-denied";
    if (this.#state !== SOCKET_STATE_INIT) throw "invalid-state";
    if (
      this.#options.family !== localAddress.tag ||
      !isUnicastIpAddress(localAddress) ||
      (isIPv4MappedAddress(localAddress) && this.ipv6Only())
    )
      throw "invalid-argument";
    this.#bindOrConnectAddress = localAddress;
    this.#network = network;
    this.#state = SOCKET_STATE_BIND;
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
    try {
      if (this.#state !== SOCKET_STATE_BIND) throw "not-in-progress";
      if (
        globalBoundAddresses.has(
          serializeIpAddress(this.#bindOrConnectAddress, true)
        )
      )
        throw "address-in-use";

      const err = ioCall(SOCKET_TCP_BIND, this.#id, {
        localAddress: this.#bindOrConnectAddress,
        family: this.#options.family,
        isIpV6Only: this.#options.ipv6Only,
      });

      if (err) {
        switch (err) {
          case -22:
            throw "address-in-use";
          case -99:
          case -49:
            throw "address-not-bindable";
          default:
            throw "unknown";
        }
      }

      this.#state = SOCKET_STATE_BOUND;

      // when port is 0, the OS will assign an ephemeral IP
      // we need to get the actual IP assigned by the OS
      globalBoundAddresses.set(
        serializeIpAddress(this.localAddress(), true),
        this.#id
      );
    } catch (err) {
      this.#error = err;
      this.#state = SOCKET_STATE_ERROR;
      throw err;
    }
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
    if (!mayTcp(network)) throw "access-denied";
    if (this.#network && network !== this.#network) throw "invalid-argument";
    if (remoteAddress.val.port === 0 && isWindows) throw "invalid-argument";
    if (ipFamily === "ipv0") throw "invalid-argument";
    if (this.#state !== SOCKET_STATE_INIT && this.#state !== SOCKET_STATE_BOUND)
      throw "invalid-state";
    const isIpv4MappedAddress = isIPv4MappedAddress(remoteAddress);
    if (
      isWildcardAddress(remoteAddress) ||
      this.#options.family !== ipFamily ||
      !isUnicastIpAddress(remoteAddress) ||
      isMulticastIpAddress(remoteAddress) ||
      remoteAddress.val.port === 0 ||
      (this.ipv6Only() && isIpv4MappedAddress)
    )
      throw "invalid-argument";

    if (this.#state !== SOCKET_STATE_BOUND) {
      const localAddress = findUnusedLocalAddress(
        ipFamily,
        isIpv4MappedAddress
      );
      this.#options.localPort = localAddress.val.port;
      this.#options.localIpSocketAddress = localAddress;
      this.startBind(network, localAddress);
      this.finishBind();
    }
    this.#bindOrConnectAddress = remoteAddress;
    this.#network = network;
    this.#state = SOCKET_STATE_CONNECT;
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
    if (this.#state !== SOCKET_STATE_CONNECT) throw "not-in-progress";

    const err = ioCall(SOCKET_TCP_CONNECT, this.#id, {
      remoteAddress: this.#bindOrConnectAddress
    });

    if (err) {
      this.#state = SOCKET_STATE_ERROR;
      switch (err) {
        // The remote address has changed.
        // TODO: what error should be thrown for EREMCHG?
        case -89:
          throw (this.#error = "unknown");

        // The calling host cannot reach the specified destination.
        // TODO: what error should be thrown for EADDRNOTAVAIL?
        case -49:
          throw (this.#error = "unknown");
        case -99:
          throw (this.#error = "ephemeral-ports-exhausted");
        case -101:
          throw (this.#error = "remote-unreachable"); // wsl ubunt)u
        case -104:
          throw (this.#error = "connection-reset");
        case -110:
          throw (this.#error = "timeout");
        case -111:
          throw (this.#error = "connection-refused");
        case -113:
          throw (this.#error = "remote-unreachable");
        case -125:
          throw (this.#error = "operation-cancelled");
      }
    }

    const inputStreamId = ioCall(SOCKET_TCP_CREATE_INPUT_STREAM, null, null);
    const outputStreamId = ioCall(SOCKET_TCP_CREATE_OUTPUT_STREAM, null, null);
    const inputStream = inputStreamCreate(SOCKET, inputStreamId);
    const outputStream = outputStreamCreate(SOCKET, outputStreamId);

    this.#state = SOCKET_STATE_CONNECTION;

    return [inputStream, outputStream];
  }

  /**
   * @returns {void}
   * @throws {invalid-state} The socket is not bound to any local address. (EDESTADDRREQ)
   * @throws {invalid-state} The socket is already in the Connection state. (EISCONN, EINVAL on BSD)
   * @throws {invalid-state} The socket is already in the Listener state.
   */
  startListen() {
    if (!mayTcp(this.#network)) throw "access-denied";
    if (!this.#isBound()) throw "invalid-state";
    this.#state = SOCKET_STATE_LISTEN;
  }

  /**
   * @returns {void}
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
   * @throws {not-in-progress} A `listen` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   */
  finishListen() {
    if (this.#state !== SOCKET_STATE_LISTEN) throw "not-in-progress";
    ioCall(SOCKET_TCP_LISTEN, this.#id, this.#listenBacklogSize);
    this.#state = SOCKET_STATE_LISTENER;
  }

  /**
   * @returns {Array<TcpSocket, InputStream, OutputStream>}
   * @throws {invalid-state} Socket is not in the Listener state. (EINVAL)
   * @throws {would-block} No pending connections at the moment. (EWOULDBLOCK, EAGAIN)
   * @throws {connection-aborted} An incoming connection was pending, but was terminated by the client before this listener could accept it. (ECONNABORTED)
   * @throws {new-socket-limit} The new socket resource could not be created because of a system limit. (EMFILE, ENFILE)
   */
  accept() {
    if (!mayTcp(this.#network)) throw "access-denied";

    if (this.#state !== SOCKET_STATE_LISTENER) throw "invalid-state";

    const inputStreamId = ioCall(SOCKET_TCP_CREATE_INPUT_STREAM, null, null);
    const outputStreamId = ioCall(SOCKET_TCP_CREATE_OUTPUT_STREAM, null, null);
    const inputStream = inputStreamCreate(SOCKET, inputStreamId);
    const outputStream = outputStreamCreate(SOCKET, outputStreamId);

    const socket = createTcpSocket(this.addressFamily());

    // copy the necessary socket options
    Object.assign(socket.#options, this.#options);

    return [socket, inputStream, outputStream];
  }

  /**
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    if (!this.#isBound()) throw "invalid-state";
    return ioCall(SOCKET_TCP_GET_LOCAL_ADDRESS, this.#id);
  }

  /**
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not connected to a remote address. (ENOTCONN)
   */
  remoteAddress() {
    if ((this.#state & STATE_MASK) !== SOCKET_STATE_CONNECTION)
      throw "invalid-state";
    return ioCall(SOCKET_TCP_GET_REMOTE_ADDRESS, this.#id);
  }

  isListening() {
    return this.#state === SOCKET_STATE_LISTENER;
  }

  /**
   * @returns {IpAddressFamily}
   */
  addressFamily() {
    return this.#options.family;
  }

  /**
   * @returns {boolean}
   * @throws {not-supported} (get/set) `this` socket is an IPv4 socket.
   */
  ipv6Only() {
    if (this.#options.family === "ipv4") throw "not-supported";
    return this.#options.ipv6Only;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   * @throws {invalid-state} (set) The socket is already bound.
   * @throws {invalid-state} (get/set) `this` socket is an IPv4 socket.
   * @throws {not-supported} (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   */
  setIpv6Only(value) {
    if (this.#options.family === "ipv4") throw "not-supported";
    if (this.#state !== SOCKET_STATE_INIT) throw "invalid-state";
    this.#options.ipv6Only = value;
  }

  /**
   * @param {bigint} value
   * @returns {void}
   * @throws {not-supported} (set) The platform does not support changing the backlog size after the initial listen.
   * @throws {invalid-argument} (set) The provided value was 0.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   */
  setListenBacklogSize(value) {
    if (value === 0n) throw "invalid-argument";
    if (
      this.#state === SOCKET_STATE_LISTEN ||
      this.#state === SOCKET_STATE_LISTENER
    )
      throw "not-supported";
    if (
      this.#state !== SOCKET_STATE_INIT &&
      this.#state !== SOCKET_STATE_BIND &&
      this.#state !== SOCKET_STATE_BOUND
    )
      throw "invalid-state";
    this.#listenBacklogSize = Number(value);
  }

  /**
   * @returns {boolean}
   */
  keepAliveEnabled() {
    return this.#options.keepAlive;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   */
  setKeepAliveEnabled(value) {
    ioCall(SOCKET_TCP_SET_KEEP_ALIVE, this.#id, value);
    this.#options.keepAlive = value;
    if (value === true) {
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
    return this.#options.keepAliveIdleTime;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The idle time must be 1 or higher.
   */
  setKeepAliveIdleTime(value) {
    value = Number(value);
    if (value < 1) throw "invalid-argument";
    this.#options.keepAliveIdleTime = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveInterval() {
    return this.#options.keepAliveInterval;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The interval must be 1 or higher.
   */
  setKeepAliveInterval(value) {
    value = Number(value);
    if (value < 1) throw "invalid-argument";

    this.#options.keepAliveInterval = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveCount() {
    return this.#options.keepAliveCount;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The count must be 1 or higher.
   */
  setKeepAliveCount(value) {
    value = Number(value);
    if (value < 1) throw "invalid-argument";
    // TODO: set this on the client socket as well
    this.#options.keepAliveCount = value;
  }

  /**
   * @returns {number}
   * @description Not available on Node.js (see https://github.com/WebAssembly/wasi-sockets/blob/main/Posix-compatibility.md#socket-options)
   */
  hopLimit() {
    return this.#options.hopLimit;
  }

  /**
   * @param {number} value
   * @returns {void}
   * @throws {invalid-argument} (set) The TTL value must be 1 or higher.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   * @throws {invalid-state} (set) The socket is already in the Listener state.
   * @description Not available on Node.js (see https://github.com/WebAssembly/wasi-sockets/blob/main/Posix-compatibility.md#socket-options)
   */
  setHopLimit(value) {
    value = Number(value);
    if (value < 1) throw "invalid-argument";

    this.#options.hopLimit = value;
  }

  /**
   * @returns {bigint}
   */
  receiveBufferSize() {
    return BigInt(this.#options.receiveBufferSize);
  }

  /**
   * @param {number} value
   * @returns {void}
   * @throws {not-supported} (set) The platform does not support changing the backlog size after the initial listen.
   * @throws {invalid-argument} (set) The provided value was 0.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   */
  setReceiveBufferSize(value) {
    value = Number(value);

    // TODO: review these assertions based on WIT specs
    // assert(this.#state.connectionState === SocketConnectionState.Connected, "invalid-state");
    if (value === 0) throw "invalid-argument";

    // TODO: set this on the client socket as well
    this.#options.receiveBufferSize = value;
  }

  /**
   * @returns {bigint}
   */
  sendBufferSize() {
    return BigInt(this.#options.sendBufferSize);
  }

  /**
   * @param {bigint} value
   * @returns {void}
   * @throws {invalid-argument} (set) The provided value was 0.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   * @throws {invalid-state} (set) The socket is already in the Listener state.
   */
  setSendBufferSize(value) {
    value = Number(value);

    // TODO: review these assertions based on WIT specs
    // assert(this.#state.connectionState === SocketConnectionState.Connected, "invalid-state");
    if (value === 0) throw "invalid-argument";

    // TODO: set this on the client socket as well
    this.#options.sendBufferSize = value;
  }

  /**
   * @returns {Pollable}
   */
  subscribe() {
    if (this.#id) return pollableCreate(this.#id);
    // 0 poll is immediately resolving
    return pollableCreate(0);
  }

  /**
   * @param {ShutdownType} shutdownType
   * @returns {void}
   * @throws {invalid-state} The socket is not in the Connection state. (ENOTCONN)
   */
  shutdown(shutdownType) {
    if (this.#state & (SOCKET_STATE_OPEN === 0)) throw "invalid-state";

    const err = ioCall(SOCKET_TCP_SHUTDOWN, this.#id, shutdownType);

    if (err === 1) throw "invalid-state";

    // TODO: figure out how to handle shutdownTypes
    if (shutdownType === "receive") {
      this.#state &= ~SOCKET_STATE_READABLE;
    } else if (shutdownType === "send") {
      this.#state &= ~SOCKET_STATE_WRITABLE;
    } else if (shutdownType === "both") {
      this.#state &= ~SOCKET_STATE_OPEN;
      this.#state |= SOCKET_STATE_CLOSED;
    }
  }

  [symbolDispose]() {
    ioCall(SOCKET_TCP_DISPOSE, this.#id, null);
    // we only need to remove the bound address from the global map
    // if the socket was already bound
    if (this.#isBound()) {
      globalBoundAddresses.delete(
        serializeIpAddress(this.#options.localIpSocketAddress, true)
      );
    }
  }
}

export const createTcpSocket = TcpSocket._create;
delete TcpSocket._create;
