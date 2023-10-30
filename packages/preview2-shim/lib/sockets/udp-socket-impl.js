/* eslint-disable no-unused-vars */

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../types/interfaces/wasi-sockets-udp").Datagram} Datagram
 * @typedef {import("../../types/interfaces/wasi-io-poll-poll").Pollable} Pollable
 */

export class UdpSocketImpl {
  /**
   *
   * @param {Network} network
   * @param {IpAddressFamily} localAddress
   * @returns {void}
   */
  startBind(network, localAddress) {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {void}
   */
  finishBind() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {Network} network
   * @param {IpAddressFamily} remoteAddress
   * @returns {void}
   */
  startConnect(network, remoteAddress) {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {void}
   */
  finishConnect() {
    throw new Error("Not implemented");
  }

  /**
   * @param {bigint} maxResults
   * @returns {Datagram[]}
   */
  receive(maxResults) {
    throw new Error("Not implemented");
  }

  /**
   * @param {Datagram[]} datagrams
   * @returns {bigint}
   */
  send(datagrams) {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {IpSocketAddress}
   */
  localAddress() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {IpSocketAddress}
   */
  remoteAddress() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {IpAddressFamily}
   */
  addressFamily() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @returns {boolean}
   */
  ipv6Only() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {boolean} value
   * @returns {void}
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
}
