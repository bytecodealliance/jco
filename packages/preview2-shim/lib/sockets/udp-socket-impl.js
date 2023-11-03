/* eslint-disable no-unused-vars */

import { assert } from "../common/assert.js";
import { deserializeIpAddress, serializeIpAddress } from "./socket-common.js";

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../types/interfaces/wasi-sockets-udp").Datagram} Datagram
 * @typedef {import("../../types/interfaces/wasi-io-poll-poll").Pollable} Pollable
 */

// See: https://github.com/nodejs/node/blob/main/src/udp_wrap.cc
const { UDP, constants: UDPConstants } = process.binding("udp_wrap");

export class UdpSocketImpl {
  /** @type {Socket} */ #clientHandle = null;
  /** @type {Socket} */ #serverHandle = null;
  /** @type {Network} */ network = null;

  #isBound = false;
  #socketOptions = {};

  /**
   * @param {IpAddressFamily} addressFamily
   * @returns {void}
   */
  constructor(addressFamily) {
    this.#socketOptions.family = addressFamily;

    this.#clientHandle = new UDP(UDPConstants.SOCKET);
    this.#serverHandle = new UDP(UDPConstants.SERVER);
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
    const address = serializeIpAddress(
      localAddress,
      this.#socketOptions.family
    );

    const { port } = localAddress.val;
    this.#socketOptions.localAddress = address;
    this.#socketOptions.localPort = port;
    this.network = network;
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
    const { localAddress, localPort, family } = this.#socketOptions;

    // TODO: see https://github.com/libuv/libuv/blob/93efccf4ee1ed3c740d10660b4bfb08edc68a1b5/src/unix/udp.c#L486
    const flags = 0;
    let err = this.#serverHandle.bind(localAddress, localPort, flags);
    if (err) {
      throw new Error(err);
    }

    this.#isBound = true;
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
  startConnect(network, remoteAddress) {
    const address = serializeIpAddress(
      remoteAddress,
      this.#socketOptions.family
    );

    const { port } = remoteAddress.val;
    this.#socketOptions.remoteAddress = address;
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
  finishConnect() {
    const { remoteAddress, remotePort } = this.#socketOptions;
    this.#clientHandle.connect(remoteAddress, remotePort);
  }

  /**
   * @param {bigint} maxResults
   * @returns {Datagram[]}
   * @throws {invalid-state} The socket is not bound to any local address. (EINVAL)
   * @throws {not-in-progress} The remote address is not reachable. (ECONNREFUSED, ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * @throws {would-block} There is no pending data available to be read at the moment. (EWOULDBLOCK, EAGAIN)
   */
  receive(maxResults) {
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
   * @throws {invalid-state} The socket is not bound to any local address. Unlike POSIX, this function does not perform an implicit bind.
   * @throws {remote-unreachable} The remote address is not reachable. (ECONNREFUSED, ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * @throws {datagram-too-large} The datagram is too large. (EMSGSIZE)
   * @throws {would-block} The send buffer is currently full. (EWOULDBLOCK, EAGAIN)
   */
  send(datagrams) {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    console.log(`[udp] local address socket`);

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
   *
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not connected to a remote address. (ENOTCONN)
   */
  remoteAddress() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {IpAddressFamily}
   */
  addressFamily() {
    console.log(`[tcp] address family socket`);

    return this.#socketOptions.family;
  }

  /**
   *
   * @returns {boolean}
   * @throws {not-supported} (get/set) `this` socket is an IPv4 socket.
   */
  ipv6Only() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {boolean} value
   * @returns {void}
   * @throws {not-supported} (get/set) `this` socket is an IPv4 socket.
   * @throws {not-supported} (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   * @throws {invalid-state} (set) The socket is already bound.
   */
  setIpv6Only(value) {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {number}
   */
  unicastHopLimit() {}

  /**
   *
   * @param {number} value
   * @returns {void}
   */
  setUnicastHopLimit(value) {
    throw new Error("Not implemented");
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

  [Symbol.dispose] () {
    console.log(`[udp] dispose socket`);
    this.#clientHandle.close();
    this.#serverHandle.close();
  }

  client() {
    return this.#clientHandle;
  }
  server() {
    return this.#serverHandle;
  }
}
