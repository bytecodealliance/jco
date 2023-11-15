/**
 * @typedef {import("../../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../../types/interfaces/wasi-sockets-network").ErrorCode} ErrorCode
 * @typedef {import("../../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp").TcpSocket} TcpSocket
 * @typedef {import("../../../types/interfaces/wasi-sockets-udp").UdpSocket} UdpSocket
 */

import { TcpSocketImpl } from "./tcp-socket-impl.js";
import { UdpSocketImpl } from "./udp-socket-impl.js";
import { assert } from "../../common/assert.js";

/** @type {ErrorCode} */
export const errorCode = {
  // ### GENERAL ERRORS ###

  /// Unknown error
  unknown: "unknown",

  /// Access denied.
  ///
  /// POSIX equivalent: EACCES, EPERM
  accessDenied: "access-denied",

  /// The operation is not supported.
  ///
  /// POSIX equivalent: EOPNOTSUPP
  notSupported: "not-supported",

  /// One of the arguments is invalid.
  ///
  /// POSIX equivalent: EINVAL
  invalidArgument: "invalid-argument",

  /// Not enough memory to complete the operation.
  ///
  /// POSIX equivalent: ENOMEM, ENOBUFS, EAI_MEMORY
  outOfMemory: "out-of-memory",

  /// The operation timed out before it could finish completely.
  timeout: "timeout",

  /// This operation is incompatible with another asynchronous operation that is already in progress.
  ///
  /// POSIX equivalent: EALREADY
  concurrencyConflict: "concurrency-conflict",

  /// Trying to finish an asynchronous operation that:
  /// - has not been started yet, or:
  /// - was already finished by a previous `finish-*` call.
  ///
  /// Note: this is scheduled to be removed when `future`s are natively supported.
  notInProgress: "not-in-progress",

  /// The operation has been aborted because it could not be completed immediately.
  ///
  /// Note: this is scheduled to be removed when `future`s are natively supported.
  wouldBlock: "would-block",

  // ### TCP & UDP SOCKET ERRORS ###

  /// The operation is not valid in the socket's current state.
  invalidState: "invalid-state",

  /// A new socket resource could not be created because of a system limit.
  newSocketLimit: "new-socket-limit",

  /// A bind operation failed because the provided address is not an address that the `network` can bind to.
  addressNotBindable: "address-not-bindable",

  /// A bind operation failed because the provided address is already in use or because there are no ephemeral ports available.
  addressInUse: "address-in-use",

  /// The remote address is not reachable
  remoteUnreachable: "remote-unreachable",

  // ### TCP SOCKET ERRORS ###

  /// The connection was forcefully rejected
  connectionRefused: "connection-refused",

  /// The connection was reset.
  connectionReset: "connection-reset",

  /// A connection was aborted.
  connectionAborted: "connection-aborted",

  // ### UDP SOCKET ERRORS ###
  datagramTooLarge: "datagram-too-large",

  // ### NAME LOOKUP ERRORS ###

  /// Name does not exist or has no suitable associated IP addresses.
  nameUnresolvable: "name-unresolvable",

  /// A temporary failure in name resolution occurred.
  temporaryResolverFailure: "temporary-resolver-failure",

  /// A permanent failure in name resolution occurred.
  permanentResolverFailure: "permanent-resolver-failure",
};

/** @type {IpAddressFamily[]} */
const supportedAddressFamilies = ["ipv4", "ipv6"];

export const IpAddressFamily = {
  ipv4: "ipv4",
  ipv6: "ipv6",
};

export class WasiSockets {
  networkCnt = 1;
  socketCnt = 1;

  // TODO: figure out what the max number of sockets should be
  maxSockets = 100;

  /** @type {Network} */ networkInstance = null;
  /** @type {Map<number,Network>} */ networks = new Map();
  /** @type {Map<number,TcpSocket} */ tcpSockets = new Map();
  /** @type {Map<number,UdpSocket} */ udpSockets = new Map();

  constructor() {
    const net = this;

    class Network {
      id = 1;
      constructor() {
        this.id = net.networkCnt++;
        net.networks.set(this.id, this);
      }
    }

    class UdpSocket extends UdpSocketImpl {
      /**
       * @param {IpAddressFamily} addressFamily
       * */
      constructor(addressFamily) {
        super(addressFamily);
        net.udpSockets.set(this.id, this);
      }
    }

    class TcpSocket extends TcpSocketImpl {
      /**
       * @param {IpAddressFamily} addressFamily
       * */
      constructor(addressFamily) {
        super(addressFamily);
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
      errorCode,
      IpAddressFamily,
    };

    this.udpCreateSocket = {
      createUdpSocket(addressFamily) {
        net.socketCnt++;
        console.log(`[udp] Create udp socket ${addressFamily}`);

        assert(
          supportedAddressFamilies.includes(addressFamily) === false,
          errorCode.notSupported,
          "The specified `address-family` is not supported."
        );

        assert(
          net.socketCnt + 1 > net.maxSockets,
          errorCode.newSocketLimit,
          "The new socket resource could not be created because of a system limit"
        );

        try {
          net.socketCnt++;
          return new UdpSocket(addressFamily);
        } catch (err) {
          assert(true, errorCode.notSupported, err);
        }
      },
    };

    this.tcpCreateSocket = {
      /**
       * @param {IpAddressFamily} addressFamily
       * @returns {TcpSocket}
       * @throws {not-supported} The specified `address-family` is not supported. (EAFNOSUPPORT)
       * @throws {new-socket-limit} The new socket resource could not be created because of a system limit. (EMFILE, ENFILE)
       */
      createTcpSocket(addressFamily) {
        console.log(`[tcp] Create tcp socket ${addressFamily}`);

        assert(
          supportedAddressFamilies.includes(addressFamily) === false,
          errorCode.notSupported,
          "The specified `address-family` is not supported."
        );

        assert(
          net.socketCnt + 1 > net.maxSockets,
          errorCode.newSocketLimit,
          "The new socket resource could not be created because of a system limit"
        );

        try {
          net.socketCnt++;
          return new TcpSocket(addressFamily);
        } catch (err) {
          assert(true, errorCode.notSupported, err);
        }
      },
    };
  }
}
