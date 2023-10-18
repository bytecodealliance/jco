/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").ErrorCode} ErrorCode
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../types/interfaces/wasi-sockets-tcp").TcpSocket} TcpSocket
 */

import { TcpSocketImpl } from "./tcp-socket-impl.js";

/** @type {ErrorCode} */
export const errorCode = {
  // ### GENERAL ERRORS ###
  unknown: "unknown",
  accessDenied: "access-denied",
  notSupported: "not-supported",
  outOfMemory: "out-of-memory",
  timeout: "timeout",
  concurrencyConflict: "concurrency-conflict",
  notInProgress: "not-in-progress",
  wouldBlock: "would-block",

  // ### IP ERRORS ###
  addressFamilyNotSupported: "address-family-not-supported",
  addressFamilyMismatch: "address-family-mismatch",
  invalidRemoteAddress: "invalid-remote-address",
  ipv4OnlyOperation: "ipv4-only-operation",
  ipv6OnlyOperation: "ipv6-only-operation",

  // ### TCP & UDP SOCKET ERRORS ###
  newSocketLimit: "new-socket-limit",
  alreadyAttached: "already-attached",
  alreadyBound: "already-bound",
  alreadyConnected: "already-connected",
  notBound: "not-bound",
  notConnected: "not-connected",
  addressNotBindable: "address-not-bindable",
  addressInUse: "address-in-use",
  ephemeralPortsExhausted: "ephemeral-ports-exhausted",
  remoteUnreachable: "remote-unreachable",

  // ### TCP SOCKET ERRORS ###
  alreadyListening: "already-listening",
  notListening: "not-listening",
  connectionRefused: "connection-refused",
  connectionReset: "connection-reset",

  // ### UDP SOCKET ERRORS ###
  datagramTooLarge: "datagram-too-large",

  // ### NAME LOOKUP ERRORS ###
  invalidName: "invalid-name",
  nameUnresolvable: "name-unresolvable",
  temporaryResolverFailure: "temporary-resolver-failure",
  permanentResolverFailure: "permanent-resolver-failure",
};

export class WasiSockets {
  networkCnt = 1;
  tcpSocketCnt = 1;

  /** @type {Network} */ networkInstance = null;
  /** @type {Map<number,Network>} */ networks = new Map();
  /** @type {Map<number,TcpSocket} */ tcpSockets = new Map();

  constructor() {
    const net = this;

    class Network {
      id = 1;
      constructor() {
        this.id = net.networkCnt++;
        net.networks.set(this.id, this);
      }
    }

    class TcpSocket extends TcpSocketImpl {
      constructor() {
        super(net.tcpSocketCnt++);
        net.tcpSockets.set(this.id, this);
      }
    }

    this.instanceNetwork = {
      /**
       * @returns {Network}
       */
      instanceNetwork() {
        console.log(`[sockets] instance network`);

        // TODO: should networkInstance be a singleton?
        if (!net.networkInstance) {
          net.networkInstance = new Network();
        }
        return net.networkInstance;
      },
    };

    this.network = {
      /**
       * @param {Network} networkId
       * @returns {void}
       **/
      dropNetwork(networkId) {
        console.log(`[network] Drop network ${networkId}`);

        // TODO: shouldn't we return a boolean to indicate success or failure?
        // TODO: update tsdoc return type
        return net.networks.delete(networkId);
      },
    };

    this.tcpCreateSocket = {
      /**
       * @param {IpAddressFamily} addressFamily
       * @returns {number}
       */
      createTcpSocket(addressFamily) {
        console.log(`[tcp] Create tcp socket ${addressFamily}`);

        const socket = new TcpSocket();
        return socket.id;
      },
    };
  }
}
