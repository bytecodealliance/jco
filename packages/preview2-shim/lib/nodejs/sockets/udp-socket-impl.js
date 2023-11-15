/* eslint-disable no-unused-vars */

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../types/interfaces/wasi-sockets-udp").Datagram} Datagram
 * @typedef {import("../../types/interfaces/wasi-io-poll-poll").Pollable} Pollable
 */

// See: https://github.com/nodejs/node/blob/main/src/udp_wrap.cc
const { UDP, SendWrap } = process.binding("udp_wrap");
import { isIP } from "node:net";
import { assert } from "../../common/assert.js";
import { deserializeIpAddress, serializeIpAddress } from "./socket-common.js";

const SocketState = {
  Error: "Error",
  Closed: "Closed",
  Connection: "Connection",
  Listener: "Listener",
};

const symbolState = Symbol("state");

export class UdpSocketImpl {
  /** @type {Socket} */ #socket = null;
  /** @type {Network} */ network = null;

  [symbolState] = {
    isBound: false,
    inProgress: false,
    ipv6Only: false,
    state: SocketState.Closed,
  };

  #socketOptions = {};

  /**
   * @param {IpAddressFamily} addressFamily
   * @returns {void}
   */
  constructor(addressFamily) {
    this.#socketOptions.family = addressFamily;

    this.#socket = new UDP();
  }
  /**
   *
   * @param {Network} network
   * @param {IpAddressFamily} localAddress
   * @throws {invalid-argument} The `local-address` has the wrong address family. (EAFNOSUPPORT, EFAULT on Windows)
   * @throws {invalid-state} The socket is already bound. (EINVAL)
   * @returns {void}
   */
  startBind(network, localAddress) {
    const address = serializeIpAddress(localAddress, this.#socketOptions.family);
    const ipFamily = `ipv${isIP(address)}`;

    assert(this[symbolState].isBound, "invalid-state", "The socket is already bound");
    assert(
      this.#socketOptions.family.toLocaleLowerCase() !== ipFamily.toLocaleLowerCase(),
      "invalid-argument",
      "The `local-address` has the wrong address family"
    );

    const { port } = localAddress.val;
    this.#socketOptions.localAddress = address;
    this.#socketOptions.localPort = port;
    this.network = network;
    this[symbolState].inProgress = true;
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
    assert(this[symbolState].inProgress === false, "not-in-progress");

    const { localAddress, localPort, family } = this.#socketOptions;

    // TODO: pass the right flags
    // see https://github.com/libuv/libuv/blob/93efccf4ee1ed3c740d10660b4bfb08edc68a1b5/src/unix/udp.c#L486
    const flags = 0;
    let err = null;
    if (family.toLocaleLowerCase() === "ipv4") {
      err = this.#socket.bind(localAddress, localPort, flags);
    } else if (family.toLocaleLowerCase() === "ipv6") {
      err = this.#socket.bind6(localAddress, localPort, flags);
    }

    if (err) {
      assert(err === -22, "address-in-use");
      assert(err === -49, "address-not-bindable");
      assert(err === -99, "address-not-bindable"); // EADDRNOTAVAIL
      assert(true, "", err);
    }

    this[symbolState].isBound = true;
  }

  /**
   *
   * @param {Network} network
   * @param {IpAddressFamily} remoteAddress
   * @returns {void}
   * @throws {invalid-argument} The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * @throws {invalid-argument} `remote-address` is a non-IPv4-mapped IPv6 address, but the socket was bound to a specific IPv4-mapped IPv6 address. (or vice versa)
   * @throws {invalid-argument} The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EDESTADDRREQ, EADDRNOTAVAIL)
   * @throws {invalid-argument} The port in `remote-address` is set to 0. (EADDRNOTAVAIL on Windows)
   * @throws {invalid-argument} The socket is already bound to a different network. The `network` passed to `connect` must be identical to the one passed to `bind`.
   */
  #startConnect(network, remoteAddress) {
    const host = serializeIpAddress(remoteAddress, this.#socketOptions.family);
    const ipFamily = `ipv${isIP(host)}`;

    assert(this.network !== null && this.network.id !== network.id, "invalid-argument");
    assert(ipFamily.toLocaleLowerCase() === "ipv0", "invalid-argument");
    assert(this.#socketOptions.family.toLocaleLowerCase() !== ipFamily.toLocaleLowerCase(), "invalid-argument");

    const { port } = remoteAddress.val;
    this.#socketOptions.remoteAddress = host;
    this.#socketOptions.remotePort = port;

    this.network = network;
    this[symbolState].inProgress = true;
  }

  /**
   *
   * @returns {void}
   * @throws {address-in-use} Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE, EADDRNOTAVAIL on Linux, EAGAIN on BSD)
   * @throws {not-in-progress} A `connect` operation is not in progress.
   * @throws {would-block} Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   */
  #finishConnect() {
    const { remoteAddress, remotePort } = this.#socketOptions;
    this.#socket.connect(remoteAddress, remotePort);
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
    this.#startConnect(this.network, remoteAddress);
    this.#finishConnect();
    return [new IncomingDatagramStream(this.#socket), new OutgoingDatagramStream(this.#socket)];
  }

  /**
   *
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
   *
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not connected to a remote address. (ENOTCONN)
   */
  remoteAddress() {
    assert(this[symbolState].state !== SocketState.Connection, "invalid-state");

    return this.#socketOptions.remoteAddress;
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
    assert(this.#socketOptions.family.toLocaleLowerCase() === "ipv4", "not-supported", "Socket is an IPv4 socket.");

    return this[symbolState].ipv6Only;
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
    assert(this[symbolState].isBound, "invalid-state", "The socket is already bound");
    assert(this.#socketOptions.family.toLocaleLowerCase() === "ipv4", "not-supported", "Socket is an IPv4 socket.");

    this[symbolState].ipv6Only = value;
  }

  /**
   *
   * @returns {number}
   */
  unicastHopLimit() {
    return this.#socketOptions.unicastHopLimit;
  }

  /**
   *
   * @param {number} value
   * @returns {void}
   * @throws {invalid-argument} The TTL value must be 1 or higher.
   */
  setUnicastHopLimit(value) {
    assert(value < 1, "invalid-argument", "The TTL value must be 1 or higher");

    this.#socketOptions.unicastHopLimit = value;
  }

  /**
   *
   * @returns {bigint}
   */
  receiveBufferSize() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {bigint} value
   * @returns {void}
   */
  setReceiveBufferSize(value) {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {bigint}
   */
  sendBufferSize() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {bigint} value
   * @returns {void}
   */
  setSendBufferSize(value) {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {Pollable}
   */
  subscribe() {
    throw new Error("Not implemented");
  }

  [Symbol.dispose]() {
    let err = null;
    err = this.#socket.recvStop((...args) => {
      console.log("stop recv", args);
    });

    if (err) {
      assert(err === -9, "invalid-state", "Interface is not currently Up");
      assert(err === -11, "not-in-progress");
      assert(true, "", err);
    }

    this.#socket.close();
    this.#socket.close();
  }

  client() {
    return this.#socket;
  }
  server() {
    return this.#socket;
  }
}

class IncomingDatagramStream {
  #socket = null;

  constructor(socket) {
    this.#socket = socket;
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
    assert(this[symbolState].isBound === false, "invalid-state");
    assert(this[symbolState].inProgress === false, "not-in-progress");

    if (maxResults === 0n) {
      return [];
    }

    this.#socket.onmessage = (...args) => console.log("recv onmessage", args[2].toString());
    this.#socket.onerror = (err) => console.log("recv error", err);
    this.#socket.recvStart();
    const datagrams = [];
    return datagrams;
  }

  /**
   *
   * @returns {Pollable} A pollable which will resolve once the stream is ready to receive again.
   */
  subscribe() {
    throw new Error("Not implemented");
  }
}

class OutgoingDatagramStream {
  #socket = null;
  constructor(socket) {
    this.#socket = socket;
  }

  /**
   *
   * @returns {bigint}
   * @throws {invalid-state} The socket is not bound to any local address. (EINVAL)
   */
  checkSend() {
    throw new Error("Not implemented");
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
    const req = new SendWrap();
    const doSend = (data, port, host, family) => {
      // setting hasCallback to false will make send() synchronous
      // TODO: handle async send
      const hasCallback = false;

      let err = null;
      if (family.toLocaleLowerCase() === "ipv4") {
        err = this.#socket.send(req, data, data.length, port, host, hasCallback);
      } else if (family.toLocaleLowerCase() === "ipv6") {
        err = this.#socket.send6(req, data, data.length, port, host, hasCallback);
      }
      return err;
    };

    datagrams.forEach((datagram) => {
      const { data, remoteAddress } = datagram;
      const { tag: family, val } = remoteAddress;
      const { address, port } = val;
      const err = doSend(data, port, serializeIpAddress(remoteAddress, family), family);
      console.error({
        err,
      });
    });
  }

  /**
   *
   * @returns {Pollable} A pollable which will resolve once the stream is ready to send again.
   */
  subscribe() {
    throw new Error("Not implemented");
  }
}
