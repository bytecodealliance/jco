/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../types/interfaces/wasi-sockets-udp").Datagram} Datagram
 * @typedef {import("../../types/interfaces/wasi-io-poll-poll").Pollable} Pollable
 */

import { isIP } from "node:net";
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
  isIPv4MappedAddress,
  isWildcardAddress,
  serializeIpAddress,
  mayUdp,
} from "./socket-common.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

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
  #socketId;
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
        tag: rinfo.family,
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
    if (this.#socketId) return pollableCreate(this.#socketId);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    // TODO: stop receiving
  }
}
const incomingDatagramStreamCreate = IncomingDatagramStream._create;
delete IncomingDatagramStream._create;

export class OutgoingDatagramStream {
  pollId = 0;
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
    const ret = ioCall(SOCKET_UDP_CHECK_SEND, this.#socketId, null);
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

      if (this.checkSend() < data.length) throw "datagram-too-large";
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
        if (ret === -65) throw "remote-unreachable";
      }
    }

    return datagramsSent;
  }

  /**
   *
   * @returns {Pollable} A pollable which will resolve once the stream is ready to send again.
   */
  subscribe() {
    if (this.pollId) return pollableCreate(this.pollId);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    // TODO: stop sending
  }
}
const outgoingDatagramStreamCreate = OutgoingDatagramStream._create;
delete OutgoingDatagramStream._create;

export class UdpSocket {
  #id;
  #network;

  // track in-progress operations
  // counter must be 0 for the operation to be considered complete
  // we increment the counter when the operation starts
  // and decrement it when the operation finishes
  #operations = {
    bind: 0,
    connect: 0,
    listen: 0,
    accept: 0,
    receive: 0,
    send: 0,
  };

  #state = {
    lastErrorState: null,
    isBound: false,
    ipv6Only: false,
    connectionState: SocketConnectionState.Closed,

    // TODO: what these default values should be?
    unicastHopLimit: 255, // 1-255
  };

  #options = {
    family: "ipv4",
    localAddress: "",
    localPort: 0,
    remoteAddress: "",
    remotePort: 0,
    reuseAddr: true,
    localIpSocketAddress: null,
  };

  get _id() {
    return this.#id;
  }

  /**
   * @param {IpAddressFamily} addressFamily
   * @returns {void}
   */
  static _create(addressFamily) {
    if (addressFamily !== "ipv4" && addressFamily !== "ipv6")
      throw "not-supported";
    const socket = new UdpSocket();
    socket.#options.family = addressFamily;
    socket.#id = ioCall(SOCKET_UDP_CREATE_HANDLE, null, {
      addressFamily,
      // force reuse the address, even if another process has already bound a socket on it!
      reuseAddr: true,
    });
    return socket;
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
    if (!mayUdp(network)) throw "access-denied";
    try {
      if (this.#state.isBound) throw "invalid-state";

      const address = serializeIpAddress(localAddress);
      const ipFamily = `ipv${isIP(address)}`;

      if (this.#options.family !== ipFamily) throw "invalid-argument";

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
      if (this.#operations.bind === 0) throw "not-in-progress";

      let { localAddress, localIpSocketAddress, localPort } = this.#options;
      if (isIP(localAddress) === 0) throw "address-not-bindable";
      if (
        globalBoundAddresses.has(serializeIpAddress(localIpSocketAddress, true))
      )
        throw "address-in-use";

      const err = ioCall(SOCKET_UDP_BIND, this.#id, {
        localAddress,
        localPort,
      });

      if (err === 0) {
        this.#state.isBound = true;
      } else {
        switch (err) {
          case -22:
          case -48: // macos
          case -98: // WSL
            throw "address-in-use";
          case -49:
          case -99: // EADDRNOTAVAIL
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
      if (localPort === 0)
        localIpSocketAddress = this.localAddress();
      globalBoundAddresses.set(serializeIpAddress(localIpSocketAddress, true), this.#id);
    } catch (err) {
      this.#state.lastErrorState = err;
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
    if (this.#state.lastErrorState !== null) throw "invalid-state";

    // Note: to comply with test programs, we cannot throw if the socket is not bound (as required by the spec - see udp.wit)
    // assert(this.#state.isBound === false, "invalid-state");

    if (this.#state.connectionState === SocketConnectionState.Connected) {
      // stream() can be called multiple times, so we need to disconnect first if we are already connected
      // Note: disconnect() will also reset the connection state but does not close the socket handle!
      const ret = ioCall(SOCKET_UDP_DISCONNECT, this.#id);

      if (ret === 0) {
        this.#state.connectionState = SocketConnectionState.Closed;
        this.#state.lastErrorState = null;
        this.#state.isBound = false;
      }

      if (ret !== 0) throw "unknown";
    }

    if (remoteAddress) {
      this.#operations.connect++;
      if (
        remoteAddress === undefined ||
        this.#state.connectionState === SocketConnectionState.Connected
      ) {
        this.#options.remoteAddress = undefined;
        this.#options.remotePort = 0;
        return;
      }

      if (isWildcardAddress(remoteAddress)) throw "invalid-argument";
      if (isIPv4MappedAddress(remoteAddress) && this.ipv6Only())
        throw "invalid-argument";
      if (remoteAddress.val.port === 0) throw "invalid-argument";

      const host = serializeIpAddress(remoteAddress);
      const ipFamily = `ipv${isIP(host)}`;

      if (ipFamily === "ipv0") throw "invalid-argument";
      if (this.#options.family !== ipFamily) throw "invalid-argument";

      const { port } = remoteAddress.val;
      this.#options.remoteAddress = host; // can be undefined
      this.#options.remotePort = port;
      this.#state.connectionState = SocketConnectionState.Connecting;

      if (host === undefined) {
        return;
      }

      if (this.#state.isBound === false) {
        // this.bind(this.network, this.#options.localIpSocketAddress);
      }

      const err = ioCall(SOCKET_UDP_CONNECT, this.#id, {
        remoteAddress: host,
        remotePort: port,
      });

      if (!err) {
        this.#state.connectionState = SocketConnectionState.Connected;
      } else {
        if (err === -22) throw "invalid-argument";
        throw "unknown";
      }

      this.#operations.connect--;
    }

    // reconfigure remote host and port.
    // Note: remoteAddress can be undefined
    const host = serializeIpAddress(remoteAddress);
    const { port } = remoteAddress?.val || { port: 0 };
    this.#options.remoteAddress = host; // host can be undefined
    this.#options.remotePort = port;

    return [
      incomingDatagramStreamCreate(this.#id),
      outgoingDatagramStreamCreate(this.#id),
    ];
  }

  /**
   *
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    if (this.#state.isBound === false) throw "invalid-state";

    const out = ioCall(SOCKET_UDP_GET_LOCAL_ADDRESS, this.#id, null);

    const { address, port, family } = out;
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
   *
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not streaming to a specific remote address. (ENOTCONN)
   */
  remoteAddress() {
    if (this.#state.connectionState !== SocketConnectionState.Connected)
      throw "invalid-state";

    const out = ioCall(SOCKET_UDP_GET_REMOTE_ADDRESS, this.#id, null);

    if (out.address === undefined) throw "invalid-state";

    const { address, port, family } = out;
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

  /**
   *
   * @returns {IpAddressFamily}
   */
  addressFamily() {
    return this.#options.family;
  }

  /**
   *
   * @returns {boolean}
   * @throws {not-supported} (get/set) `this` socket is an IPv4 socket.
   */
  ipv6Only() {
    if (this.#options.family === "ipv4")
      throw "not-supported";

    return this.#state.ipv6Only;
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
    if (value === true && this.#options.family === "ipv4")
      throw "not-supported";
    if (this.#state.isBound) throw "invalid-state";

    this.#state.ipv6Only = value;
  }

  /**
   *
   * @returns {number}
   */
  unicastHopLimit() {
    return this.#state.unicastHopLimit;
  }

  /**
   *
   * @param {number} value
   * @returns {void}
   * @throws {invalid-argument} The TTL value must be 1 or higher.
   */
  setUnicastHopLimit(value) {
    if (value < 1) throw "invalid-argument";
    ioCall(SOCKET_UDP_SET_UNICAST_HOP_LIMIT, this.#id, value);
    this.#state.unicastHopLimit = value;
  }

  /**
   *
   * @returns {bigint}
   */
  receiveBufferSize() {
    // `receiveBufferSize()` would throws EBADF if called on an unbound socket.
    // TODO: should we throw if the socket is not bound?
    // assert(this.#state.isBound === false, "invalid-state");

    // Note: on WSL, this may report a different value than the one set!
    const ret = ioCall(SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE, this.#id, null);

    if (ret === -9) throw "invalid-state"; // EBADF

    return ret;
  }

  /**
   *
   * @param {bigint} value
   * @returns {void}
   * @throws {invalid-argument} The provided value was 0.
   */
  setReceiveBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    ioCall(SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE, this.#id, value);
  }

  /**
   *
   * @returns {bigint}
   */
  sendBufferSize() {
    // TODO: should we throw if the socket is not bound?
    // assert(this.#state.isBound === false, "invalid-state");

    const ret = ioCall(SOCKET_UDP_GET_SEND_BUFFER_SIZE, this.#id, null);
    // if (ret === -9) {
    //   // TODO: handle the case where bad file descriptor (EBADF) is returned
    //   // This happens when the socket is not bound
    //   return this.#state.sendBufferSize;
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
    if (value === 0n) throw "invalid-argument";

    // value = cappedUint32(value);
    ioCall(SOCKET_UDP_SET_SEND_BUFFER_SIZE, this.#id, value);

    // this.#socket.bufferSize(Number(cappedValue), BufferSizeFlags.SO_SNDBUF, exceptionInfo);
  }

  /**
   *
   * @returns {Pollable}
   */
  subscribe() {
    if (this.#id) return pollableCreate(this.#id);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    ioCall(SOCKET_UDP_DISPOSE, this.#id, null);
  }
}

export const createUdpSocket = UdpSocket._create;
delete UdpSocket._create;
