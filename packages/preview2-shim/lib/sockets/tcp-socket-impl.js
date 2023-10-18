/* eslint-disable no-unused-vars */

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").TcpSocket} TcpSocket
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").InputStream} InputStream
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").OutputStream} OutputStream
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../types/interfaces/wasi-poll-poll").Pollable} Pollable
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").ShutdownType} ShutdownType
 */

export class TcpSocketImpl {
  /** @type {number} */ id;

  constructor(socketId) {
    this.id = socketId;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {Network} network
   * @param {IpSocketAddress} localAddress
   * @returns {void}
   **/
  startBind(tcpSocket, network, localAddress) {
    console.log(`[tcp] start bind socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   **/
  finishBind(tcpSocket) {
    console.log(`[tcp] finish bind socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {Network} network
   * @param {IpSocketAddress} remoteAddress
   * @returns {void}
   * */
  startConnect(tcpSocket, network, remoteAddress) {
    console.log(`[tcp] start connect socket ${tcpSocket.id} to ${remoteAddress} on network ${network.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Array<InputStream, OutputStream>}
   * */
  finishConnect(tcpSocket) {
    console.log(`[tcp] finish connect socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   *  @param {TcpSocket} tcpSocket
   * @returns {void}
   * */
  startListen(tcpSocket) {}

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * */
  finishListen(tcpSocket) {
    console.log(`[tcp] finish listen socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Array<TcpSocket, InputStream, OutputStream>}
   * */
  accept(tcpSocket) {
    console.log(`[tcp] accept socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpSocketAddress}
   * */
  localAddress(tcpSocket) {
    console.log(`[tcp] local address socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpSocketAddress}
   * */
  remoteAddress(tcpSocket) {
    console.log(`[tcp] remote address socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpAddressFamily}
   * */
  addressFamily(tcpSocket) {
    console.log(`[tcp] address family socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * */
  ipv6Only(tcpSocket) {
    console.log(`[tcp] ipv6 only socket ${this.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {boolean} value
   * @returns {void}
   * */
  setIpv6Only(tcpSocket, value) {
    console.log(`[tcp] set ipv6 only socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {bigint} value
   * @returns {void}
   * */
  setListenBacklogSize(tcpSocket, value) {
    console.log(`[tcp] set listen backlog size socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * */
  keepAlive(tcpSocket) {
    console.log(`[tcp] keep alive socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   *  @param {TcpSocket} tcpSocket
   * @param {boolean} value
   * @returns {void}
   * */
  setKeepAlive(tcpSocket, value) {
    console.log(`[tcp] set keep alive socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * */
  noDelay(tcpSocket) {
    console.log(`[tcp] no delay socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * */
  unicastHopLimit(tcpSocket) {
    console.log(`[tcp] unicast hop limit socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {number} value
   * @returns {void}
   * */
  setUnicastHopLimit(tcpSocket, value) {
    console.log(`[tcp] set unicast hop limit socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {bigint}
   * */
  receiveBufferSize(tcpSocket) {
    console.log(`[tcp] receive buffer size socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {bigint} value
   * @returns {void}
   * */
  setReceiveBufferSize(tcpSocket, value) {
    console.log(`[tcp] set receive buffer size socket ${this.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {bigint}
   * */
  sendBufferSize(tcpSocket) {
    console.log(`[tcp] send buffer size socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {bigint} value
   * @returns {void}
   * */
  setSendBufferSize(tcpSocket, value) {
    console.log(`[tcp] set send buffer size socket ${tcpSocket.id} to ${value}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Pollable}
   * */
  subscribe(tcpSocket) {
    console.log(`[tcp] subscribe socket ${this.id}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {ShutdownType} shutdownType
   * @returns {void}
   * */
  shutdown(tcpSocket, shutdownType) {
    console.log(`[tcp] shutdown socket ${tcpSocket.id} with ${shutdownType}`);
    throw new Error("not implemented");
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   * */
  dropTcpSocket(tcpSocket) {
    console.log(`[tcp] drop socket ${tcpSocket.id}`);
    throw new Error("not implemented");
  }
}
