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
import { platform } from "node:os";
import { assert } from "../../common/assert.js";
import { streams } from "../io.js";
const { InputStream, OutputStream } = streams;

const symbolDispose = Symbol.dispose || Symbol.for("dispose");
const symbolSocketState = Symbol.SocketInternalState || Symbol.for("SocketInternalState");
const symbolOperations = Symbol.SocketOperationsState || Symbol.for("SocketOperationsState");

// See: https://github.com/nodejs/node/blob/main/src/tcp_wrap.cc
const { TCP, TCPConnectWrap, constants: TCPConstants } = process.binding("tcp_wrap");
const { ShutdownWrap } = process.binding("stream_wrap");

import { INPUT_STREAM_CREATE, OUTPUT_STREAM_CREATE } from "../../io/calls.js";
import { SOCKET } from "../../io/stream-types.js";
import { inputStreamCreate, ioCall, outputStreamCreate, pollableCreate } from "../../io/worker-io.js";
import {
  deserializeIpAddress,
  findUnsuedLocalAddress,
  isIPv4MappedAddress,
  isMulticastIpAddress,
  isUnicastIpAddress,
  serializeIpAddress,
} from "./socket-common.js";

// TODO: move to a common
const ShutdownType = {
  Receive: "receive",
  Send: "send",
  Both: "both",
};

// TODO: move to a common
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
export class TcpSocketImpl {
  id = 1;
  /** @type {TCP.TCPConstants.SOCKET} */ #socket = null;
  /** @type {Network} */ network = null;

  #connections = 0;

  #pollId = null;

  // track in-progress operations
  // counter must be 0 for the operation to be considered complete
  // we increment the counter when the operation starts
  // and decrement it when the operation finishes
  [symbolOperations] = {
    bind: 0,
    connect: 0,
    listen: 0,
    accept: 0,
  };

  [symbolSocketState] = {
    errorState: null,
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

  #socketOptions = {
    family: "ipv4",
    localAddress: "",
    localPort: 0,
    remoteAddress: "",
    remotePort: 0,
  };

  // this is set by the TcpSocket child class
  #tcpSocketChildClassType = null;

  /**
   * @param {IpAddressFamily} addressFamily
   * @param {TcpSocket} childClassType
   * @param {number} id
   */
  constructor(addressFamily, childClassType, id) {
    this.id = id;

    this.#socketOptions.family = addressFamily.toLocaleLowerCase();
    this.#tcpSocketChildClassType = childClassType;

    this.#socket = new TCP(TCPConstants.SOCKET | TCPConstants.SERVER);
  }

  #handleConnection(err, newClientSocket) {
    if (err) {
      assert(true, "unknown", err);
    }

    this.#connections++;

    this[symbolSocketState].acceptedClient = new NodeSocket({
      handle: newClientSocket,
    });
    this[symbolSocketState].acceptedClient.server = this.#socket;
    this[symbolSocketState].acceptedClient._server = this.#socket;

    // TODO: handle data received from the client
    this[symbolSocketState].acceptedClient._handle.onread = (nread, buffer) => {
      if (nread > 0) {
        const data = buffer.toString("utf8", 0, nread);
        console.log("accepted socket on read:", data);
      }
    };
  }

  #handleDisconnect(err) {
    if (err) {
      assert(true, "unknown", err);
    }

    this.#connections--;
  }

  #onClientConnectComplete(err) {
    if (err) {
      // TODO: figure out what theis error mean and why it is thrown
      assert(err === -89, "unknown"); // on macos

      assert(err === -99, "ephemeral-ports-exhausted");
      assert(err === -104, "connection-reset");
      assert(err === -110, "timeout");
      assert(err === -111, "connection-refused");
      assert(err === -113, "remote-unreachable");
      assert(err === -125, "operation-cancelled");

      throw new Error(err);
    }

    this[symbolSocketState].connectionState = SocketConnectionState.Connected;
  }

  // TODO: is this needed?
  #handleAfterShutdown() {}

  #autoBind(network, ipFamily) {
    const unsusedLocalAddress = findUnsuedLocalAddress(ipFamily);
    this.#socketOptions.localAddress = serializeIpAddress(unsusedLocalAddress, this.#socketOptions.family);
    this.#socketOptions.localPort = unsusedLocalAddress.val.port;
    this.startBind(network, unsusedLocalAddress);
    this.finishBind();
  }

  #cacheBoundAddress() {
    let { localIpSocketAddress: boundAddress, localPort } = this.#socketOptions;
    // when port is 0, the OS will assign an ephemeral port
    // we need to get the actual port assigned by the OS
    if (localPort === 0) {
      boundAddress = this.localAddress();
    }
    globalBoundAddresses.set(serializeIpAddress(boundAddress, true), this.#socket);
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
    try {
      assert(this[symbolSocketState].isBound, "invalid-state", "The socket is already bound");

      const address = serializeIpAddress(localAddress);
      const ipFamily = `ipv${isIP(address)}`;

      assert(
        this.#socketOptions.family.toLocaleLowerCase() !== ipFamily.toLocaleLowerCase(),
        "invalid-argument",
        "The `local-address` has the wrong address family"
      );

      assert(isUnicastIpAddress(localAddress) === false, "invalid-argument");
      assert(isIPv4MappedAddress(localAddress) && this.ipv6Only(), "invalid-argument");

      const { port } = localAddress.val;
      this.#socketOptions.localIpSocketAddress = localAddress;
      this.#socketOptions.localAddress = address;
      this.#socketOptions.localPort = port;
      this.network = network;
      this[symbolOperations].bind++;
      this[symbolSocketState].errorState = null;
    } catch (err) {
      this[symbolSocketState].errorState = err;
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
      assert(this[symbolOperations].bind === 0, "not-in-progress");

      const { localAddress, localIpSocketAddress, localPort, family } = this.#socketOptions;
      assert(isIP(localAddress) === 0, "address-not-bindable");
      assert(globalBoundAddresses.has(serializeIpAddress(localIpSocketAddress, true)), "address-in-use");

      let err = null;
      let bind = "bind"; // ipv4
      if (family.toLocaleLowerCase() === "ipv6") {
        bind = "bind6";
      }

      err = this.#socket[bind](localAddress, localPort);

      if (err) {
        this.#socket.close();
        assert(err === -22, "address-in-use");
        assert(err === -49, "address-not-bindable");
        assert(err === -99, "address-not-bindable"); // EADDRNOTAVAIL
        assert(true, "unknown", err);
      }

      this[symbolSocketState].errorState = null;
      this[symbolSocketState].isBound = true;
      this[symbolOperations].bind--;

      this.#cacheBoundAddress();
    } catch (err) {
      this[symbolSocketState].errorState = err;
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
    const host = serializeIpAddress(remoteAddress);
    const ipFamily = `ipv${isIP(host)}`;
    try {
      assert(host === "0.0.0.0" || host === "0:0:0:0:0:0:0:0", "invalid-argument");
      assert(this.#socketOptions.family.toLocaleLowerCase() !== ipFamily.toLocaleLowerCase(), "invalid-argument");
      assert(isUnicastIpAddress(remoteAddress) === false, "invalid-argument");
      assert(isMulticastIpAddress(remoteAddress), "invalid-argument");
      assert(isIPv4MappedAddress(remoteAddress) && this.ipv6Only(), "invalid-argument");

      // TODO: test program `preview2_tcp_states.rs` for this assertion checks for invalid-state error
      // however, WIT file specifies that this should throw an invalid-argument error
      assert(remoteAddress.val.port === 0, "invalid-state");

      if (this[symbolSocketState].isBound === false) {
        this.#autoBind(network, ipFamily);
      }

      assert(
        this[symbolSocketState].connectionState === SocketConnectionState.Connected ||
          this[symbolSocketState].connectionState === SocketConnectionState.Listener,
        "invalid-state"
      );

      assert(network !== this.network, "invalid-argument");
      assert(ipFamily.toLocaleLowerCase() === "ipv0", "invalid-argument");
      assert(remoteAddress.val.port === 0 && platform() === "win32", "invalid-argument");
    } catch (err) {
      this[symbolSocketState].errorState = err;
      throw err;
    }

    this[symbolSocketState].errorState = null;

    this.#socketOptions.remoteIpSocketAddress = remoteAddress;
    this.#socketOptions.remoteAddress = host;
    this.#socketOptions.remotePort = remoteAddress.val.port;
    this.network = network;
    this[symbolOperations].connect++;
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
    try {
      assert(this[symbolOperations].connect === 0, "not-in-progress");
    } catch (err) {
      this[symbolSocketState].errorState = err;
      throw err;
    }

    this[symbolSocketState].errorState = null;

    const { localAddress, localPort, remoteAddress, remotePort, family } = this.#socketOptions;
    const connectReq = new TCPConnectWrap();

    let err = null;
    let connect = "connect"; // ipv4
    if (family.toLocaleLowerCase() === "ipv6") {
      connect = "connect6";
    }

    err = this.#socket[connect](connectReq, remoteAddress, remotePort);

    if (err) {
      console.error(`[tcp] connect error on socket: ${err}`);
      this[symbolSocketState].connectionState = SocketConnectionState.Error;
    }

    connectReq.oncomplete = this.#onClientConnectComplete.bind(this);
    connectReq.address = remoteAddress;
    connectReq.port = remotePort;
    connectReq.localAddress = localAddress;
    connectReq.localPort = localPort;

    this.#socket.onread = (buffer) => {
      // TODO: handle data received from the server
    };

    this.#socket.readStart();

    const inputStream = inputStreamCreate(SOCKET, ioCall(INPUT_STREAM_CREATE | SOCKET, null, {}));
    const outputStream = outputStreamCreate(SOCKET, ioCall(OUTPUT_STREAM_CREATE | SOCKET, null, {}));

    this[symbolOperations].connect--;
    this[symbolSocketState].connectionState = SocketConnectionState.Connecting;

    return [inputStream, outputStream];
  }

  /**
   * @returns {void}
   * @throws {invalid-state} The socket is not bound to any local address. (EDESTADDRREQ)
   * @throws {invalid-state} The socket is already in the Connection state. (EISCONN, EINVAL on BSD)
   * @throws {invalid-state} The socket is already in the Listener state.
   */
  startListen() {
    try {
      assert(this[symbolSocketState].errorState !== null, "invalid-state");
      assert(this[symbolSocketState].isBound === false, "invalid-state");
      assert(this[symbolSocketState].connectionState === SocketConnectionState.Connected, "invalid-state");
      assert(this[symbolSocketState].connectionState === SocketConnectionState.Listener, "invalid-state");
    } catch (err) {
      this[symbolSocketState].errorState = err;
      throw err;
    }

    this[symbolSocketState].errorState = null;
    this[symbolOperations].listen++;
  }

  /**
   * @returns {void}
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
   * @throws {not-in-progress} A `listen` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   */
  finishListen() {
    try {
      assert(this[symbolOperations].listen === 0, "not-in-progress");
    } catch (err) {
      this[symbolSocketState].errorState = err;
      throw err;
    }

    this[symbolSocketState].errorState = null;

    const err = this.#socket.listen(this[symbolSocketState].backlogSize);
    if (err) {
      console.error(`[tcp] listen error on socket: ${err}`);
      this.#socket.close();

      // TODO: handle errors
      throw new Error(err);
    }

    this[symbolSocketState].connectionState = SocketConnectionState.Listener;
    this[symbolOperations].listen--;
  }

  /**
   * @returns {Array<TcpSocket, InputStream, OutputStream>}
   * @throws {invalid-state} Socket is not in the Listener state. (EINVAL)
   * @throws {would-block} No pending connections at the moment. (EWOULDBLOCK, EAGAIN)
   * @throws {connection-aborted} An incoming connection was pending, but was terminated by the client before this listener could accept it. (ECONNABORTED)
   * @throws {new-socket-limit} The new socket resource could not be created because of a system limit. (EMFILE, ENFILE)
   */
  accept() {
    this[symbolOperations].accept++;

    try {
      assert(this[symbolSocketState].connectionState !== SocketConnectionState.Listener, "invalid-state");
    } catch (err) {
      this[symbolSocketState].errorState = err;
      throw err;
    }

    this[symbolSocketState].errorState = null;

    if (this[symbolSocketState].isBound === false) {
      this.#autoBind(this.network, this.addressFamily());
    }
    const inputStream = inputStreamCreate(SOCKET_INPUT_STREAM, this.id);
    const outputStream = outputStreamCreate(SOCKET_OUTPUT_STREAM, this.id);

    // Because we have to return a valid TcpSocket resrouce type,
    // we need to instantiate the correct child class
    // TODO: figure out a more elegant way to do this
    const socket = new this.#tcpSocketChildClassType(this.addressFamily());

    // The returned socket is bound and in the Connection state.
    // The following properties are inherited from the listener socket:
    // - `address-family`
    // - `ipv6-only`
    // - `keep-alive-enabled`
    // - `keep-alive-idle-time`
    // - `keep-alive-interval`
    // - `keep-alive-count`
    // - `hop-limit`
    // - `receive-buffer-size`
    // - `send-buffer-size`
    //
    socket[symbolSocketState].ipv6Only = this[symbolSocketState].ipv6Only;
    socket[symbolSocketState].keepAlive = this[symbolSocketState].keepAlive;
    socket[symbolSocketState].keepAliveIdleTime = this[symbolSocketState].keepAliveIdleTime;
    socket[symbolSocketState].keepAliveInterval = this[symbolSocketState].keepAliveInterval;
    socket[symbolSocketState].keepAliveCount = this[symbolSocketState].keepAliveCount;
    socket[symbolSocketState].hopLimit = this[symbolSocketState].hopLimit;
    socket[symbolSocketState].receiveBufferSize = this[symbolSocketState].receiveBufferSize;
    socket[symbolSocketState].sendBufferSize = this[symbolSocketState].sendBufferSize;

    this[symbolOperations].accept--;

    return [socket, inputStream, outputStream];
  }

  /**
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    assert(this[symbolSocketState].isBound === false, "invalid-state");

    const out = {};
    this.#socket.getsockname(out);

    const { address, port, family } = out;
    this.#socketOptions.localAddress = address;
    this.#socketOptions.localPort = port;
    this.#socketOptions.family = family.toLocaleLowerCase();

    return {
      tag: family.toLocaleLowerCase(),
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
    assert(this[symbolSocketState].connectionState !== SocketConnectionState.Connected, "invalid-state");

    const out = {};
    this.#socket.getpeername(out);

    const { address, port, family } = out;

    this.#socketOptions.remoteAddress = address;
    this.#socketOptions.remotePort = port;
    this.#socketOptions.family = family.toLocaleLowerCase();

    return {
      tag: family.toLocaleLowerCase(),
      val: {
        address: deserializeIpAddress(address, family),
        port,
      },
    };
  }

  isListening() {
    return this[symbolSocketState].connectionState === SocketConnectionState.Listener;
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
    assert(this.#socketOptions.family.toLocaleLowerCase() === "ipv4", "not-supported");

    return this[symbolSocketState].ipv6Only;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   * @throws {invalid-state} (set) The socket is already bound.
   * @throws {invalid-state} (get/set) `this` socket is an IPv4 socket.
   * @throws {not-supported} (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   */
  setIpv6Only(value) {
    assert(this.#socketOptions.family.toLocaleLowerCase() === "ipv4", "not-supported");
    assert(this[symbolSocketState].isBound, "invalid-state");

    this[symbolSocketState].ipv6Only = value;
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
    assert(this[symbolSocketState].connectionState === SocketConnectionState.Connected, "invalid-state");

    this[symbolSocketState].backlogSize = Number(value);
  }

  /**
   * @returns {boolean}
   */
  keepAliveEnabled() {
    return this[symbolSocketState].keepAlive;
  }

  /**
   * @param {boolean} value
   * @returns {void}
   */
  setKeepAliveEnabled(value) {
    this.#socket.setKeepAlive(value);
    this[symbolSocketState].keepAlive = value;

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
    return this[symbolSocketState].keepAliveIdleTime;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The idle time must be 1 or higher.
   */
  setKeepAliveIdleTime(value) {
    assert(value < 1, "invalid-argument", "The idle time must be 1 or higher.");

    this[symbolSocketState].keepAliveIdleTime = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveInterval() {
    return this[symbolSocketState].keepAliveInterval;
  }

  /**
   *
   * @param {Duration} value
   * @returns {void}
   * @throws {invalid-argument} (set) The interval must be 1 or higher.
   */
  setKeepAliveInterval(value) {
    assert(value < 1, "invalid-argument", "The interval must be 1 or higher.");

    this[symbolSocketState].keepAliveInterval = value;
  }

  /**
   *
   * @returns {Duration}
   */
  keepAliveCount() {
    return this[symbolSocketState].keepAliveCount;
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
    this[symbolSocketState].keepAliveCount = value;
  }

  /**
   * @returns {number}
   */
  hopLimit() {
    return this[symbolSocketState].hopLimit;
  }

  /**
   * @param {number} value
   * @returns {void}
   * @throws {invalid-argument} (set) The TTL value must be 1 or higher.
   * @throws {invalid-state} (set) The socket is already in the Connection state.
   * @throws {invalid-state} (set) The socket is already in the Listener state.
   */
  setHopLimit(value) {
    assert(!value || value < 1, "invalid-argument", "The TTL value must be 1 or higher.");
    assert(this[symbolSocketState].connectionState === SocketConnectionState.Connected, "invalid-state");

    // TODO: set this on the client socket as well
    this[symbolSocketState].hopLimit = value;
  }

  /**
   * @returns {bigint}
   */
  receiveBufferSize() {
    return this[symbolSocketState].receiveBufferSize;
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
    assert(this[symbolSocketState].connectionState === SocketConnectionState.Connected, "invalid-state");

    // TODO: set this on the client socket as well
    this[symbolSocketState].receiveBufferSize = value;
  }

  /**
   * @returns {bigint}
   */
  sendBufferSize() {
    return this[symbolSocketState].sendBufferSize;
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
    assert(this[symbolSocketState].connectionState === SocketConnectionState.Connected, "invalid-state");

    // TODO: set this on the client socket as well
    this[symbolSocketState].sendBufferSize = value;
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
    assert(this[symbolSocketState].connectionState !== SocketConnectionState.Connected, "invalid-state");

    // TODO: figure out how to handle shutdownTypes
    if (shutdownType === ShutdownType.Receive) {
      this[symbolSocketState].canReceive = false;
    } else if (shutdownType === ShutdownType.Send) {
      this[symbolSocketState].canSend = false;
    } else if (shutdownType === ShutdownType.Both) {
      this[symbolSocketState].canReceive = false;
      this[symbolSocketState].canSend = false;
    }

    const req = new ShutdownWrap();
    req.oncomplete = this.#handleAfterShutdown.bind(this);
    req.handle = this._handle;
    req.callback = () => {};
    const err = this._handle.shutdown(req);

    assert(err === 1, "invalid-state");
  }

  [symbolDispose]() {
    this.#socket.close();

    // we only need to remove the bound address from the global map
    // if the socket was already bound
    if (this[symbolSocketState].isBound) {
      globalBoundAddresses.delete(serializeIpAddress(this.#socketOptions.localIpSocketAddress, true));
    }
  }

  server() {
    return this.#socket;
  }
  client() {
    return this.#socket;
  }
}
