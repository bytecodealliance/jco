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

import { Socket as NodeSocket } from "node:net";

export class TcpSocketImpl {
  /** @type {number} */ id;
  /** @type {boolean} */ isBound = false;
  /** @type {NodeSocket} */ socket = null;
  /** @type {Network} */ network = null;
  /** @type {IpAddressFamily} */ addressFamily;
  /** @type {IpSocketAddress} */ localAddress = null;

  ipv6Only = false;
  state = "closed";

  constructor(socketId, addressFamily) {
    this.id = socketId;
    this.addressFamily = addressFamily;

    this.socket = new NodeSocket();
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {Network} network
   * @param {IpSocketAddress} localAddress
   * @returns {void}
   **/
  startBind(tcpSocket, network, localAddress) {
    console.log(`[tcp] start bind socket ${tcpSocket.id}`);

    if (this.isBound) {
      throw new Error("socket is already bound");
    }

    this.localAddress = localAddress;
    this.network = network;
    this.isBound = true;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {void}
   **/
  finishBind(tcpSocket) {
    console.log(`[tcp] finish bind socket ${tcpSocket.id}`);

    this.network = null;
    this.localAddress = null;
    this.isBound = false;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {Network} network
   * @param {IpSocketAddress} remoteAddress
   * @returns {void}
   * */
  startConnect(tcpSocket, network, remoteAddress) {
    console.log(`[tcp] start connect socket ${tcpSocket.id} to ${remoteAddress} on network ${network.id}`);

    this.network = network;

    this.socket.connect({
      localAddress: this.localAddress.address,
      localPort: this.localAddress.port,
      host: remoteAddress.address,
      port: remoteAddress.port,
      family: this.addressFamily,
    });

    this.socket.on("connect", () => {
      console.log(`[tcp] connect on socket ${tcpSocket.id}`);
      this.state = "connected";
    });

    this.socket.on("ready", () => {
      console.log(`[tcp] ready on socket ${tcpSocket.id}`);
      this.state = "connection";
    });

    this.socket.on("close", () => {
      console.log(`[tcp] close on socket ${tcpSocket.id}`);
      this.state = "closed";
    });

    this.socket.on("end", () => {
      console.log(`[tcp] end on socket ${tcpSocket.id}`);
      this.state = "closed";
    });

    this.socket.on("timeout", () => {
      console.error(`[tcp] timeout on socket ${tcpSocket.id}`);
      this.state = "closed";
    });

    this.socket.on("error", (err) => {
      console.error(`[tcp] error on socket ${tcpSocket.id}: ${err}`);
      this.state = "error";
    });
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {Array<InputStream, OutputStream>}
   * */
  finishConnect(tcpSocket) {
    console.log(`[tcp] finish connect socket ${tcpSocket.id}`);

    this.socket.destroySoon();
  }

  /**
   *  @param {TcpSocket} tcpSocket
   * @returns {void}
   * */
  startListen(tcpSocket) {
    console.log(`[tcp] start listen socket ${tcpSocket.id}`);

    this.socket.listen();
  }

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

    if (!this.isBound) {
      throw new Error("not-bound");
    }

    return this.socket.localAddress();
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpSocketAddress}
   * */
  remoteAddress(tcpSocket) {
    console.log(`[tcp] remote address socket ${tcpSocket.id}`);


    if (!this.isBound) {
      throw new Error("not-bound");
    }

    if (this.state !== "connected") {
      throw new Error("not-connected");
    }

    return this.socket.remoteAddress();
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {IpAddressFamily}
   * */
  addressFamily(tcpSocket) {
    console.log(`[tcp] address family socket ${tcpSocket.id}`);

    return this.socket.localFamily;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @returns {boolean}
   * */
  ipv6Only(tcpSocket) {
    console.log(`[tcp] ipv6 only socket ${this.id}`);

    return this.ipv6Only;
  }

  /**
   * @param {TcpSocket} tcpSocket
   * @param {boolean} value
   * @returns {void}
   * */
  setIpv6Only(tcpSocket, value) {
    console.log(`[tcp] set ipv6 only socket ${tcpSocket.id} to ${value}`);

    this.ipv6Only = value;
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
