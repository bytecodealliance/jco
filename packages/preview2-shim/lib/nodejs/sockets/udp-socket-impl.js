/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../types/interfaces/wasi-sockets-udp").Datagram} Datagram
 * @typedef {import("../../types/interfaces/wasi-io-poll-poll").Pollable} Pollable
 */

import { isIP } from "node:net";
import { assert } from "../../common/assert.js";
import {
  SOCKET_UDP_BIND,
  SOCKET_UDP_CHECK_SEND,
  SOCKET_UDP_CONNECT,
  SOCKET_UDP_CREATE_HANDLE,
  SOCKET_UDP_DISCONNECT,
  SOCKET_UDP_DISPOSE,
  SOCKET_UDP_GET_LOCAL_ADDRESS,
  SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE,
  SOCKET_UDP_GET_REMOTE_ADDRESS,
  SOCKET_UDP_GET_SEND_BUFFER_SIZE,
  SOCKET_UDP_RECEIVE,
  SOCKET_UDP_SEND,
  SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE,
  SOCKET_UDP_SET_SEND_BUFFER_SIZE,
  SOCKET_UDP_SET_UNICAST_HOP_LIMIT,
} from "../../io/calls.js";
import { ioCall, pollableCreate } from "../../io/worker-io.js";
import {
  deserializeIpAddress,
  findUnsuedLocalAddress,
  isIPv4MappedAddress,
  isWildcardAddress,
  serializeIpAddress,
} from "./socket-common.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");
const symbolSocketState =
  Symbol.SocketInternalState || Symbol.for("SocketInternalState");
const symbolOperations =
  Symbol.SocketOperationsState || Symbol.for("SocketOperationsState");

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
/** @type {Map<string, number>} */
const globalBoundAddresses = new Map();

export class IncomingDatagramStream {
  #pollId = 0;
  #socketId = 0;
  static _create(socketId) {
    const stream = new IncomingDatagramStream();
    stream.#socketId = socketId;
    return stream;
  }

  /**
   *
   * @param {bigint} maxResults
   * @returns {Datagram[]}
   * @throws {invalid-state} The socket is not bound to any local address. (EINVAL)
   * @throws {not-in-progress} The remote address is not reachable. (ECONNREFUSED, ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * @throws {remote-unreachable} The remote address is not reachable. (ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN, ENONET)
   * @throws {connection-refused} The connection was refused. (ECONNREFUSED)
   * @throws {would-block} There is no pending data available to be read at the moment. (EWOULDBLOCK, EAGAIN)
   */
  receive(maxResults) {
    if (maxResults === 0n) {
      return [];
    }

    const datagrams = ioCall(
      SOCKET_UDP_RECEIVE,
      // socket that's receiving the datagrams
      this.#socketId,
      {
        maxResults,
      }
    );

    return datagrams.map(({ data, rinfo }) => {
      let address = rinfo.address;
      if (rinfo._address) {
        // set the original address that the socket was bound to
        address = rinfo._address;
      }
      const remoteAddress = {
        tag: rinfo.family.toLocaleLowerCase(),
        val: {
          address: deserializeIpAddress(address, rinfo.family),
          port: rinfo.port,
        },
      };
      return {
        data,
        remoteAddress,
      };
    });
  }

  /**
   *
   * @returns {Pollable} A pollable which will resolve once the stream is ready to receive again.
   */
  subscribe() {
    if (this.#pollId) return pollableCreate(this.#pollId);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    // TODO: stop receiving
  }
}
const incomingDatagramStreamCreate = IncomingDatagramStream._create;
delete IncomingDatagramStream._create;

export class OutgoingDatagramStream {
  #pollId = 0;
  #socketId = 0;

  static _create(socketId) {
    const stream = new OutgoingDatagramStream(socketId);
    stream.#socketId = socketId;
    return stream;
  }

  /**
   *
   * @returns {bigint}
   */
  checkSend() {
    const ret = ioCall(SOCKET_UDP_CHECK_SEND, this.#socketId);
    // TODO: When this function returns ok(0), the `subscribe` pollable will
    // become ready when this function will report at least ok(1), or an
    // error.
    return ret;
  }

  /**
   *
   * @param {Datagram[]} datagrams
   * @returns {bigint}
   * @throws {invalid-argument} The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * @throws {invalid-argument} `remote-address` is a non-IPv4-mapped IPv6 address, but the socket was bound to a specific IPv4-mapped IPv6 address. (or vice versa)
   * @throws {invalid-argument} The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EDESTADDRREQ, EADDRNOTAVAIL)
   * @throws {invalid-argument} The port in `remote-address` is set to 0. (EDESTADDRREQ, EADDRNOTAVAIL)
   * @throws {invalid-argument} The socket is in "connected" mode and the `datagram.remote-address` does not match the address passed to `connect`. (EISCONN)
   * @throws {invalid-argument} The socket is not "connected" and no value for `remote-address` was provided. (EDESTADDRREQ)
   * @throws {remote-unreachable} The remote address is not reachable. (ECONNREFUSED, ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * @throws {connection-refused} The connection was refused. (ECONNREFUSED)
   * @throws {datagram-too-large} The datagram is too large. (EMSGSIZE)
   */
  send(datagrams) {
    if (datagrams.length === 0) {
      return 0n;
    }

    let datagramsSent = 0n;

    for (const datagram of datagrams) {
      const { data, remoteAddress } = datagram;
      const remotePort = remoteAddress?.val?.port || undefined;
      const host = serializeIpAddress(remoteAddress, false);

      assert(this.checkSend() < data.length, "datagram-too-large");
      // TODO: add the other assertions

      const ret = ioCall(
        SOCKET_UDP_SEND,
        this.#socketId, // socket that's sending the datagrams
        {
          data,
          remotePort,
          remoteHost: host,
        }
      );
      if (ret === 0) {
        datagramsSent++;
      } else {
        assert(ret === -65, "remote-unreachable");
      }
    }

    return datagramsSent;
  }

  /**
   *
   * @returns {Pollable} A pollable which will resolve once the stream is ready to send again.
   */
  subscribe() {
    if (this.#pollId) return pollableCreate(this.#pollId);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    // TODO: stop sending
  }
}
const outgoingDatagramStreamCreate = OutgoingDatagramStream._create;
delete OutgoingDatagramStream._create;

export class UdpSocket {
  id = 1;
  #pollId = 0;
  /** @type {Network} */ network = null;

  // track in-progress operations
  // counter must be 0 for the operation to be considered complete
  // we increment the counter when the operation starts
  // and decrement it when the operation finishes
  [symbolOperations] = {
    bind: 0,
    connect: 0,
    listen: 0,
    accept: 0,
    receive: 0,
    send: 0,
  };

  [symbolSocketState] = {
    lastErrorState: null,
    isBound: false,
    ipv6Only: false,
    connectionState: SocketConnectionState.Closed,

    // TODO: what these default values should be?
    unicastHopLimit: 255, // 1-255
  };

  #socketOptions = {
    family: "ipv4",
    localAddress: "",
    localPort: 0,
    remoteAddress: "",
    remotePort: 0,
    reuseAddr: true,
    localIpSocketAddress: null,
  };

  get _pollId() {
    return this.#pollId;
  }

  /**
   * @param {IpAddressFamily} addressFamily
   * @returns {void}
   */
  static _create(addressFamily, id) {
    const socket = new UdpSocket();
    socket.id = id;
    socket.#socketOptions.family = addressFamily;
    socket.#pollId = ioCall(SOCKET_UDP_CREATE_HANDLE, null, {
      addressFamily,
      // force reuse the address, even if another process has already bound a socket on it!
      reuseAddr: true,
    });
    return socket;
  }

  #autoBind(network, ipFamily) {
    const localAddress = findUnsuedLocalAddress(ipFamily);
    this.#socketOptions.localAddress = serializeIpAddress(
      localAddress,
      this.#socketOptions.family
    );
    this.#socketOptions.localPort = localAddress.val.port;
    this.startBind(network, localAddress);
    this.finishBind();
  }

  #cacheBoundAddress() {
    let { localIpSocketAddress: boundAddress, localPort } = this.#socketOptions;
    // when port is 0, the OS will assign an ephemeral port
    // we need to get the actual port assigned by the OS
    if (localPort === 0) {
      boundAddress = this.localAddress();
    }
    globalBoundAddresses.set(serializeIpAddress(boundAddress, true), this.id);
  }

  /**
   *
   * @param {Network} network
   * @param {IpSocketAddress} localAddress
   * @returns {void}
   * @throws {invalid-argument} The `local-address` has the wrong address family. (EAFNOSUPPORT, EFAULT on Windows)
   * @throws {invalid-state} The socket is already bound. (EINVAL)
   */
  startBind(network, localAddress) {
    if (!this.allowed()) throw "access-denied";
    try {
      assert(
        this[symbolSocketState].isBound,
        "invalid-state",
        "The socket is already bound"
      );

      const address = serializeIpAddress(localAddress);
      const ipFamily = `ipv${isIP(address)}`;

      assert(
        this.#socketOptions.family.toLocaleLowerCase() !==
          ipFamily.toLocaleLowerCase(),
        "invalid-argument",
        "The `local-address` has the wrong address family"
      );

      assert(
        isIPv4MappedAddress(localAddress) && this.ipv6Only(),
        "invalid-argument"
      );

      const { port } = localAddress.val;
      this.#socketOptions.localIpSocketAddress = localAddress;
      this.#socketOptions.localAddress = address;
      this.#socketOptions.localPort = port;
      this.network = network;
      this[symbolOperations].bind++;
      this[symbolSocketState].lastErrorState = null;
    } catch (err) {
      this[symbolSocketState].lastErrorState = err;
      throw err;
    }
  }

  /**
   *
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

      const { localAddress, localIpSocketAddress, localPort } =
        this.#socketOptions;
      assert(isIP(localAddress) === 0, "address-not-bindable");
      assert(
        globalBoundAddresses.has(
          serializeIpAddress(localIpSocketAddress, true)
        ),
        "address-in-use"
      );

      const err = ioCall(SOCKET_UDP_BIND, this.id, {
        localAddress,
        localPort,
      });

      if (err === 0) {
        this[symbolSocketState].isBound = true;
      } else {
        assert(err === -22, "address-in-use");
        assert(err === -48, "address-in-use"); // macos
        assert(err === -49, "address-not-bindable");
        assert(err === -98, "address-in-use"); // WSL
        assert(err === -99, "address-not-bindable"); // EADDRNOTAVAIL
        // catch all other errors
        assert(true, "unknown", err);
      }

      this[symbolSocketState].lastErrorState = null;
      this[symbolSocketState].isBound = true;
      this[symbolOperations].bind--;

      this.#cacheBoundAddress();
    } catch (err) {
      this[symbolSocketState].lastErrorState = err;
      throw err;
    }
  }

  /**
   * Alias for startBind() and finishBind()
   * @param {Network} network
   * @param {IpAddressFamily} localAddress
   */
  bind(network, localAddress) {
    this.startBind(network, localAddress);
    this.finishBind();
  }

  /**
   *
   * @param {Network} network
   * @param {IpAddressFamily | undefined} remoteAddress
   * @returns {void}
   * @throws {invalid-argument} The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * @throws {invalid-argument} `remote-address` is a non-IPv4-mapped IPv6 address, but the socket was bound to a specific IPv4-mapped IPv6 address. (or vice versa)
   * @throws {invalid-argument} The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EDESTADDRREQ, EADDRNOTAVAIL)
   * @throws {invalid-argument} The port in `remote-address` is set to 0. (EADDRNOTAVAIL on Windows)
   * @throws {invalid-argument} The socket is already bound to a different network. The `network` passed to `connect` must be identical to the one passed to `bind`.
   */
  #startConnect(network, remoteAddress = undefined) {
    this[symbolOperations].connect++;

    if (
      remoteAddress === undefined ||
      this[symbolSocketState].connectionState ===
        SocketConnectionState.Connected
    ) {
      this.#socketOptions.remoteAddress = undefined;
      this.#socketOptions.remotePort = 0;
      return;
    }

    assert(
      isWildcardAddress(remoteAddress),
      "invalid-argument",
      "The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`)"
    );
    assert(
      isIPv4MappedAddress(remoteAddress) && this.ipv6Only(),
      "invalid-argument"
    );
    assert(
      remoteAddress.val.port === 0,
      "invalid-argument",
      "The port in `remote-address` is set to 0"
    );

    const host = serializeIpAddress(remoteAddress);
    const ipFamily = `ipv${isIP(host)}`;

    assert(ipFamily.toLocaleLowerCase() === "ipv0", "invalid-argument");
    assert(
      this.#socketOptions.family.toLocaleLowerCase() !==
        ipFamily.toLocaleLowerCase(),
      "invalid-argument"
    );

    const { port } = remoteAddress.val;
    this.#socketOptions.remoteAddress = host; // can be undefined
    this.#socketOptions.remotePort = port;
    this.network = network;
  }

  /**
   *
   * @returns {void}
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE, EADDRNOTAVAIL on Linux, EAGAIN on BSD)
   * @throws {not-in-progress} A `connect` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   */
  #finishConnect() {
    // Note: remoteAddress can be undefined
    const { remoteAddress, remotePort } = this.#socketOptions;
    this[symbolSocketState].connectionState = SocketConnectionState.Connecting;

    if (
      remoteAddress === undefined ||
      this[symbolSocketState].connectionState ===
        SocketConnectionState.Connected
    ) {
      return;
    }

    if (this[symbolSocketState].isBound === false) {
      // this.bind(this.network, this.#socketOptions.localIpSocketAddress);
    }

    const err = ioCall(SOCKET_UDP_CONNECT, this.id, {
      remoteAddress,
      remotePort,
    });

    if (!err) {
      this[symbolSocketState].connectionState = SocketConnectionState.Connected;
    } else {
      assert(err === -22, "invalid-argument");
      assert(true, "unknown", err);
    }

    this[symbolOperations].connect--;
  }

  /**
   * Alias for startBind() and finishBind()
   */
  #connect(network, remoteAddress = undefined) {
    this.#startConnect(network, remoteAddress);
    this.#finishConnect();
  }

  #disconnect() {
    const ret = ioCall(SOCKET_UDP_DISCONNECT, this.id);

    if (ret === 0) {
      this[symbolSocketState].connectionState = SocketConnectionState.Closed;
      this[symbolSocketState].lastErrorState = null;
      this[symbolSocketState].isBound = false;
    }

    assert(ret !== 0, "unknown");
  }

  /**
   *
   * @param {IpSocketAddress | undefined} remoteAddress
   * @returns {Array<IncomingDatagramStream, OutgoingDatagramStream>}
   * @throws {invalid-argument} The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * @throws {invalid-argument} remote-address` is a non-IPv4-mapped IPv6 address, but the socket was bound to a specific IPv4-mapped IPv6 address. (or vice versa)
   * @throws {invalid-argument} The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` /  :`). (EDESTADDRREQ, EADDRNOTAVAIL)
   * @throws {invalid-argument} The port in `remote-address` is set to 0. (EDESTADDRREQ, EADDRNOTAVAIL)
   * @throws {invalid-state} The socket is not bound.
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE, EADDRNOTAVAIL on Linux, EAGAIN on BSD)
   * @throws {remote-unreachable} The remote address is not reachable. (ECONNRESET, ENETRESET, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN, ENONET)
   * @throws {connection-refused} The connection was refused. (ECONNREFUSED)
   */
  stream(remoteAddress = undefined) {
    assert(this[symbolSocketState].lastErrorState !== null, "invalid-state");

    // Note: to comply with test programs, we cannot throw if the socket is not bound (as required by the spec - see udp.wit)
    // assert(this[symbolSocketState].isBound === false, "invalid-state");

    if (
      this[symbolSocketState].connectionState ===
      SocketConnectionState.Connected
    ) {
      // stream() can be called multiple times, so we need to disconnect first if we are already connected
      // Note: disconnect() will also reset the connection state but does not close the socket handle!
      this.#disconnect();
    }

    if (remoteAddress) {
      this.#connect(this.network, remoteAddress);
    }

    // reconfigure remote host and port.
    // Note: remoteAddress can be undefined
    const host = serializeIpAddress(remoteAddress);
    const { port } = remoteAddress?.val || { port: 0 };
    this.#socketOptions.remoteAddress = host; // host can be undefined
    this.#socketOptions.remotePort = port;

    return [
      incomingDatagramStreamCreate(this.id),
      outgoingDatagramStreamCreate(this.id),
    ];
  }

  /**
   *
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    assert(this[symbolSocketState].isBound === false, "invalid-state");

    const out = ioCall(SOCKET_UDP_GET_LOCAL_ADDRESS, this.id);

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
   *
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not streaming to a specific remote address. (ENOTCONN)
   */
  remoteAddress() {
    assert(
      this[symbolSocketState].connectionState !==
        SocketConnectionState.Connected,
      "invalid-state",
      "The socket is not streaming to a specific remote address"
    );

    const out = ioCall(SOCKET_UDP_GET_REMOTE_ADDRESS, this.id);

    assert(
      out.address === undefined,
      "invalid-state",
      "The socket is not streaming to a specific remote address"
    );

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

  /**
   *
   * @returns {IpAddressFamily}
   */
  addressFamily() {
    return this.#socketOptions.family;
  }

  /**
   *
   * @returns {boolean}
   * @throws {not-supported} (get/set) `this` socket is an IPv4 socket.
   */
  ipv6Only() {
    assert(
      this.#socketOptions.family.toLocaleLowerCase() === "ipv4",
      "not-supported",
      "Socket is an IPv4 socket."
    );

    return this[symbolSocketState].ipv6Only;
  }

  /**
   *
   * @param {boolean} value
   * @returns {void}
   * @throws {not-supported} (get/set) `this` socket is an IPv4 socket.
   * @throws {invalid-state} (set) The socket is already bound.
   * @throws {not-supported} (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   */
  setIpv6Only(value) {
    assert(
      value === true &&
        this.#socketOptions.family.toLocaleLowerCase() === "ipv4",
      "not-supported",
      "Socket is an IPv4 socket."
    );
    assert(
      this[symbolSocketState].isBound,
      "invalid-state",
      "The socket is already bound"
    );

    this[symbolSocketState].ipv6Only = value;
  }

  /**
   *
   * @returns {number}
   */
  unicastHopLimit() {
    return this[symbolSocketState].unicastHopLimit;
  }

  /**
   *
   * @param {number} value
   * @returns {void}
   * @throws {invalid-argument} The TTL value must be 1 or higher.
   */
  setUnicastHopLimit(value) {
    assert(value < 1, "invalid-argument", "The TTL value must be 1 or higher");

    ioCall(SOCKET_UDP_SET_UNICAST_HOP_LIMIT, this.id, { value });
    this[symbolSocketState].unicastHopLimit = value;
  }

  /**
   *
   * @returns {bigint}
   */
  receiveBufferSize() {
    // `receiveBufferSize()` would throws EBADF if called on an unbound socket.
    // TODO: should we throw if the socket is not bound?
    // assert(this[symbolSocketState].isBound === false, "invalid-state");

    // or we can auto-bind the socket if it's not bound?
    if (this[symbolSocketState].isBound === false) {
      this.#autoBind(this.network, this.#socketOptions.family);
    }

    // Note: on WSL, this may report a different value than the one set!
    const ret = ioCall(SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE, this.id);

    assert(ret === -9, "invalid-state"); // EBADF

    return ret;
  }

  /**
   *
   * @param {bigint} value
   * @returns {void}
   * @throws {invalid-argument} The provided value was 0.
   */
  setReceiveBufferSize(value) {
    assert(value === 0n, "invalid-argument", "The provided value was 0");

    value = Number(value);
    ioCall(SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE, this.id, { value });
  }

  /**
   *
   * @returns {bigint}
   */
  sendBufferSize() {
    // TODO: should we throw if the socket is not bound?
    // assert(this[symbolSocketState].isBound === false, "invalid-state");

    const ret = ioCall(SOCKET_UDP_GET_SEND_BUFFER_SIZE, this.id);
    // if (ret === -9) {
    //   // TODO: handle the case where bad file descriptor (EBADF) is returned
    //   // This happens when the socket is not bound
    //   return this[symbolSocketState].sendBufferSize;
    // }

    return ret;
  }

  /**
   *
   * @param {bigint} value
   * @returns {void}
   * @throws {invalid-argument} The provided value was 0.
   */
  setSendBufferSize(value) {
    assert(value === 0n, "invalid-argument", "The provided value was 0");

    // value = cappedUint32(value);
    ioCall(SOCKET_UDP_SET_SEND_BUFFER_SIZE, this.id, { value });

    // this.#socket.bufferSize(Number(cappedValue), BufferSizeFlags.SO_SNDBUF, exceptionInfo);
  }

  /**
   *
   * @returns {Pollable}
   */
  subscribe() {
    if (this.#pollId) return pollableCreate(this.#pollId);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    ioCall(SOCKET_UDP_DISPOSE, this.id);
  }
}

export const udpSocketImplCreate = UdpSocket._create;
delete UdpSocket._create;
