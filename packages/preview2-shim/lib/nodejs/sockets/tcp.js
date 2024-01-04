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

import { isIP } from "node:net";
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
  deserializeIpAddress,
  findUnusedLocalAddress,
  isIPv4MappedAddress,
  isMulticastIpAddress,
  isUnicastIpAddress,
  isWildcardAddress,
  serializeIpAddress,
} from "./socket-common.js";

const ShutdownType = {
  Receive: "receive",
  Send: "send",
  Both: "both",
};

const SocketConnectionState = {
  Error: "Error",
  Closed: "Closed",
  Connecting: "Connecting",
  Connected: "Connected",
  Listening: "Listening",
};

// As a workaround, we store the bound address in a global map
// this is needed because 'address-in-use' is not always thrown when binding
// more than one socket to the same address
// TODO: remove this workaround when we figure out why!
const globalBoundAddresses = new Map();

// TODO: implement would-block exceptions
// TODO: implement concurrency-conflict exceptions
export class TcpSocket {
  #network;
  #id;

  // track in-progress operations
  // counter must be 0 for the operation to be considered complete
  // we increment the counter when the operation starts
  // and decrement it when the operation finishes
  #operations = {
    bind: 0,
    connect: 0,
    listen: 0,
    accept: 0,
  };

  #state = {
    lastErrorState: null,
    isBound: false,
    ipv6Only: false,
    connectionState: SocketConnectionState.Closed,
    acceptedClient: null,
    canReceive: true,
    canSend: true,

    // See: https://github.com/torvalds/linux/blob/fe3cfe869d5e0453754cf2b4c75110276b5e8527/net/core/request_sock.c#L19-L31
    backlogSize: 128,

    // TODO: what these default values should be?
    keepAlive: false,
    keepAliveCount: 1,
    keepAliveIdleTime: 1,
    keepAliveInterval: 1,
    hopLimit: 1,
    receiveBufferSize: 1,
    sendBufferSize: 1,
  };

  #options = {
    family: "ipv4",
    localAddress: "",
    localPort: 0,
    remoteAddress: "",
    remotePort: 0,
    localIpSocketAddress: null,
  };

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

  #autoBind(network, ipFamily, { iPv4MappedAddress = false } = {}) {
    const localAddress = findUnusedLocalAddress(ipFamily, {
      iPv4MappedAddress,
    });
    this.#options.localAddress = serializeIpAddress(
      localAddress,
      this.#options.family
    );
    this.#options.localPort = localAddress.val.port;
    this.#options.localIpSocketAddress = localAddress;
    this.startBind(network, localAddress);
    this.finishBind();
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
    try {
      if (this.#state.isBound) throw "invalid-state";

      const address = serializeIpAddress(localAddress);
      const ipFamily = `ipv${isIP(address)}`;

      if (this.#options.family !== ipFamily) throw "invalid-argument";
      if (!isUnicastIpAddress(localAddress)) throw "invalid-argument";
      if (isIPv4MappedAddress(localAddress) && this.ipv6Only())
        throw "invalid-argument";

      const { port } = localAddress.val;
      this.#options.localIpSocketAddress = localAddress;
      this.#options.localAddress = address;
      this.#options.localPort = port;
      this.#network = network;
      this.#operations.bind++;
      this.#state.lastErrorState = null;
    } catch (err) {
      this.#state.lastErrorState = err;
      throw err;
    }
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
      if (this.#operations.bind === 0) throw "not-in-progress";

      let { localAddress, localIpSocketAddress, localPort, family } =
        this.#options;
      if (isIP(localAddress) === 0) throw "address-not-bindable";
      if (
        globalBoundAddresses.has(serializeIpAddress(localIpSocketAddress, true))
      )
        throw "address-in-use";

      const err = ioCall(SOCKET_TCP_BIND, this.#id, {
        localAddress,
        localPort,
        family,
        // Note: don't call getter method here, it will throw because of the assertion
        isIpV6Only: this.#state.ipv6Only,
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

      this.#state.lastErrorState = null;
      this.#state.isBound = true;
      this.#operations.bind--;

      // when port is 0, the OS will assign an ephemeral IP
      // we need to get the actual IP assigned by the OS
      if (localPort === 0) {
        localIpSocketAddress = this.localAddress();
      }
      globalBoundAddresses.set(serializeIpAddress(localIpSocketAddress, true), this.#id);
    } catch (err) {
      this.#state.lastErrorState = err;
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
    const host = serializeIpAddress(remoteAddress);
    const ipFamily = `ipv${isIP(host)}`;
    try {
      if (this.#state.connectionState === SocketConnectionState.Connected)
        throw "invalid-state";
      if (this.#state.connectionState === SocketConnectionState.Connecting)
        throw "invalid-state";
      if (this.#state.connectionState === SocketConnectionState.Listening)
        throw "invalid-state";
      if (isWildcardAddress(remoteAddress)) throw "invalid-argument";
      if (this.#options.family !== ipFamily) throw "invalid-argument";
      if (!isUnicastIpAddress(remoteAddress)) throw "invalid-argument";
      if (isMulticastIpAddress(remoteAddress)) throw "invalid-argument";
      const iPv4MappedAddress = isIPv4MappedAddress(remoteAddress);
      if (iPv4MappedAddress && this.ipv6Only()) throw "invalid-argument";
      if (remoteAddress.val.port === 0) throw "invalid-argument";

      if (this.#state.isBound === false) {
        this.#autoBind(network, ipFamily, {
          iPv4MappedAddress,
        });
      }

      if (network !== this.#network) throw "invalid-argument";
      if (ipFamily === "ipv0") throw "invalid-argument";
      if (remoteAddress.val.port === 0 && isWindows) throw "invalid-argument";
    } catch (err) {
      this.#state.lastErrorState = err;
      throw err;
    }

    this.#state.lastErrorState = null;

    this.#options.remoteIpSocketAddress = remoteAddress;
    this.#options.remoteAddress = host;
    this.#options.remotePort = remoteAddress.val.port;
    this.#network = network;
    this.#operations.connect++;
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
    if (this.#operations.connect === 0) {
      this.#state.lastErrorState = "not-in-progress";
      throw "not-in-progress";
    }

    this.#state.lastErrorState = null;

    const { localAddress, localPort, remoteAddress, remotePort, family } =
      this.#options;

    this.#state.connectionState = SocketConnectionState.Connecting;

    const err = ioCall(SOCKET_TCP_CONNECT, this.#id, {
      remoteAddress,
      remotePort,
      localAddress,
      localPort,
      family,
    });

    if (err) {
      switch (err) {
        // The remote address has changed.
        // TODO: what error should be thrown for EREMCHG?
        case -89:
          throw "unknown";

        // The calling host cannot reach the specified destination.
        // TODO: what error should be thrown for EADDRNOTAVAIL?
        case -49:
          throw "unknown";
        case -99:
          throw "ephemeral-ports-exhausted";
        case -101:
          throw "remote-unreachable"; // wsl ubuntu
        case -104:
          throw "connection-reset";
        case -110:
          throw "timeout";
        case -111:
          throw "connection-refused";
        case -113:
          throw "remote-unreachable";
        case -125:
          throw "operation-cancelled";
      }
      this.#state.connectionState = SocketConnectionState.Error;
      throw new Error(err);
    }

    const inputStreamId = ioCall(SOCKET_TCP_CREATE_INPUT_STREAM, null, null);
    const outputStreamId = ioCall(SOCKET_TCP_CREATE_OUTPUT_STREAM, null, null);
    const inputStream = inputStreamCreate(SOCKET, inputStreamId);
    const outputStream = outputStreamCreate(SOCKET, outputStreamId);

    this.#state.connectionState = SocketConnectionState.Connected;
    this.#operations.connect--;

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
    if (
      this.#state.lastErrorState !== null ||
      !this.#state.isBound ||
      this.#state.connectionState === SocketConnectionState.Connected ||
      this.#state.connectionState === SocketConnectionState.Listening
    ) {
      this.#state.lastErrorState = "invalid-state";
      throw "invalid-state";
    }
    this.#state.lastErrorState = null;
    this.#operations.listen++;
  }

  /**
   * @returns {void}
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
   * @throws {not-in-progress} A `listen` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   */
  finishListen() {
    if (this.#operations.listen === 0) {
      this.#state.lastErrorState = "not-in-progress";
      throw "not-in-progress";
    }
    this.#state.lastErrorState = null;

    const err = ioCall(SOCKET_TCP_LISTEN, this.#id, {
      backlogSize: this.#state.backlogSize,
    });
    if (err) throw "unknown";

    this.#state.connectionState = SocketConnectionState.Listening;
    this.#operations.listen--;
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
    this.#operations.accept++;

    if (this.#state.connectionState !== SocketConnectionState.Listening) {
      this.#state.lastErrorState = "invalid-state";
      throw "invalid-state";
    }

    this.#state.lastErrorState = null;

    if (this.#state.isBound === false) {
      this.#autoBind(this.#network, this.addressFamily());
    }

    const inputStreamId = ioCall(SOCKET_TCP_CREATE_INPUT_STREAM, null, null);
    const outputStreamId = ioCall(SOCKET_TCP_CREATE_OUTPUT_STREAM, null, null);
    const inputStream = inputStreamCreate(SOCKET, inputStreamId);
    const outputStream = outputStreamCreate(SOCKET, outputStreamId);

    const socket = createTcpSocket(this.addressFamily());
    // Copy the socket state:
    // The returned socket is bound and in the Connection state. The following properties are inherited from the listener socket:
    // - `address-family`
    // - `ipv6-only`
    // - `keep-alive-enabled`
    // - `keep-alive-idle-time`
    // - `keep-alive-interval`
    // - `keep-alive-count`
    // - `hop-limit`
    // - `receive-buffer-size`
    // - `send-buffer-size`

    // Note: don't call getter/setters methods here, they will throw
    socket.#options.family = this.#options.family;

    // Note: don't call getter/setters methods here, they will throw
    const {
      ipv6Only,
      keepAlive,
      keepAliveIdleTime,
      keepAliveInterval,
      keepAliveCount,
      hopLimit,
      receiveBufferSize,
      sendBufferSize,
    } = this.#state;

    socket.#state = {
      ...socket.#state,
      ipv6Only,
      keepAlive,
      keepAliveIdleTime,
      keepAliveInterval,
      keepAliveCount,
      hopLimit,
      receiveBufferSize,
      sendBufferSize,
    };

    this.#operations.accept--;

    return [socket, inputStream, outputStream];
  }

  /**
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    if (!this.#state.isBound) throw "invalid-state";

    const { address, port, family } = ioCall(
      SOCKET_TCP_GET_LOCAL_ADDRESS,
      this.#id
    );
    this.#options.localAddress = address;
    this.#options.localPort = port;
    this.#options.family = family;

    return {
      tag: family,
      val: {
        address: deserializeIpAddress(address, family),
        port,
      },
    };
  }

  /**
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not connected to a remote address. (ENOTCONN)
   */
  remoteAddress() {
    if (this.#state.connectionState !== SocketConnectionState.Connected)
      throw "invalid-state";

    const { address, port, family } = ioCall(
      SOCKET_TCP_GET_REMOTE_ADDRESS,
      this.#id
    );
    this.#options.remoteAddress = address;
    this.#options.remotePort = port;
    this.#options.family = family;

    return {
      tag: family,
      val: {
        address: deserializeIpAddress(address, family),
        port,
      },
    };
  }

  isListening() {
    return this.#state.connectionState === SocketConnectionState.Listening;
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
    return this.#state.ipv6Only;
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
    if (this.#state.isBound) throw "invalid-state";
    this.#state.ipv6Only = value;
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
    if (this.#state.connectionState === SocketConnectionState.Connected)
      throw "invalid-state";
    this.#state.backlogSize = Number(value);
  }

  /**
   * @returns {boolean}
   */
  keepAliveEnabled() {
    return this.#state.keepAlive;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   */
  setKeepAliveEnabled(value) {
    ioCall(SOCKET_TCP_SET_KEEP_ALIVE, this.#id, {
      keepAlive: value,
    });

    this.#state.keepAlive = value;

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
    return this.#state.keepAliveIdleTime;
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
    this.#state.keepAliveIdleTime = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveInterval() {
    return this.#state.keepAliveInterval;
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

    this.#state.keepAliveInterval = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveCount() {
    return this.#state.keepAliveCount;
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
    this.#state.keepAliveCount = value;
  }

  /**
   * @returns {number}
   * @description Not available on Node.js (see https://github.com/WebAssembly/wasi-sockets/blob/main/Posix-compatibility.md#socket-options)
   */
  hopLimit() {
    return this.#state.hopLimit;
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

    this.#state.hopLimit = value;
  }

  /**
   * @returns {bigint}
   */
  receiveBufferSize() {
    return BigInt(this.#state.receiveBufferSize);
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
    this.#state.receiveBufferSize = value;
  }

  /**
   * @returns {bigint}
   */
  sendBufferSize() {
    return BigInt(this.#state.sendBufferSize);
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
    this.#state.sendBufferSize = value;
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
    if (this.#state.connectionState !== SocketConnectionState.Connected)
      throw "invalid-state";

    // TODO: figure out how to handle shutdownTypes
    if (shutdownType === ShutdownType.Receive) {
      this.#state.canReceive = false;
    } else if (shutdownType === ShutdownType.Send) {
      this.#state.canSend = false;
    } else if (shutdownType === ShutdownType.Both) {
      this.#state.canReceive = false;
      this.#state.canSend = false;
    }

    const err = ioCall(SOCKET_TCP_SHUTDOWN, this.#id, {
      shutdownType,
    });

    if (err === 1) throw "invalid-state";
  }

  [symbolDispose]() {
    ioCall(SOCKET_TCP_DISPOSE, this.#id, null);

    // we only need to remove the bound address from the global map
    // if the socket was already bound
    if (this.#state.isBound) {
      globalBoundAddresses.delete(
        serializeIpAddress(this.#options.localIpSocketAddress, true)
      );
    }
  }
}

export const createTcpSocket = TcpSocket._create;
delete TcpSocket._create;
