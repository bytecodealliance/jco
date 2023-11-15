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

    console.log(`[tcp] start bind socket to ${address}:${localAddress.val.port}`);

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
    console.log(`[udp] finish bind socket`);

    assert(this[symbolState].inProgress === false, "not-in-progress");

    const { localAddress, localPort, family } = this.#socketOptions;

    // TODO: see https://github.com/libuv/libuv/blob/93efccf4ee1ed3c740d10660b4bfb08edc68a1b5/src/unix/udp.c#L486
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
  startConnect(network, remoteAddress) {
    console.log(`[udp] start connect socket`);

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
  finishConnect() {
    console.log(`[udp] finish connect socket`);

    const { remoteAddress, remotePort } = this.#socketOptions;
    this.#socket.connect(remoteAddress, remotePort);
  }

  /**
   * @param {bigint} maxResults
   * @returns {Datagram[]}
   * @throws {invalid-state} The socket is not bound to any local address. (EINVAL)
   * @throws {not-in-progress} The remote address is not reachable. (ECONNREFUSED, ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * @throws {would-block} There is no pending data available to be read at the moment. (EWOULDBLOCK, EAGAIN)
   */
  receive(maxResults) {
    console.log(`[udp] receive socket`);

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
    console.log(`[udp] send socket`);

    const req = new SendWrap();
    const doSend = (data, port, host, family) => {
      console.log(`[udp] send socket to ${host}:${port}`);

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
   * @returns {IpSocketAddress}
   * @throws {invalid-state} The socket is not bound to any local address.
   */
  localAddress() {
    console.log(`[udp] local address socket`);

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
    console.log(`[udp] remote address socket`);

    assert(this[symbolState].state !== SocketState.Connection, "invalid-state");

    return this.#socketOptions.remoteAddress;
  }

  /**
   *
   * @returns {IpAddressFamily}
   */
  addressFamily() {
    console.log(`[udp] address family socket`);

    return this.#socketOptions.family;
  }

  /**
   *
   * @returns {boolean}
   * @throws {not-supported} (get/set) `this` socket is an IPv4 socket.
   */
  ipv6Only() {
    console.log(`[udp] ipv6 only socket`);

    return this[symbolState].ipv6Only;
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
    console.log(`[udp] set ipv6 only socket to ${value}`);

    this[symbolState].ipv6Only = value;
  }

  /**
   *
   * @returns {number}
   */
  unicastHopLimit() {
    console.log(`[udp] unicast hop limit socket`);

    throw new Error("Not implemented");
  }

  /**
   *
   * @param {number} value
   * @returns {void}
   */
  setUnicastHopLimit(value) {
    console.log(`[udp] set unicast hop limit socket`);

    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {bigint}
   */
  receiveBufferSize() {
    console.log(`[udp] receive buffer size socket`);

    throw new Error("Not implemented");
  }

  /**
   *
   * @param {bigint} value
   * @returns {void}
   */
  setReceiveBufferSize(value) {
    console.log(`[udp] set receive buffer size socket`);

    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {bigint}
   */
  sendBufferSize() {
    console.log(`[udp] send buffer size socket`);

    throw new Error("Not implemented");
  }

  /**
   *
   * @param {bigint} value
   * @returns {void}
   */
  setSendBufferSize(value) {
    console.log(`[udp] set send buffer size socket`);

    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {Pollable}
   */
  subscribe() {
    console.log(`[udp] subscribe socket`);

    throw new Error("Not implemented");
  }

  [Symbol.dispose]() {
    console.log(`[udp] dispose socket`);

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
