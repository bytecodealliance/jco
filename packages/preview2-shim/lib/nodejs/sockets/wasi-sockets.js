/**
 * @typedef {import("../../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../../types/interfaces/wasi-sockets-network").ErrorCode} ErrorCode
 * @typedef {import("../../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../../types/interfaces/wasi-sockets-network").IpAddress} IpAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp").TcpSocket} TcpSocket
 * @typedef {import("../../../types/interfaces/wasi-sockets-udp").UdpSocket} UdpSocket
 */

import { isIP } from "net";
import { assert } from "../../common/assert.js";
import {
  SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST,
} from "../../io/calls.js";
import { ioCall, pollableCreate } from "../../io/worker-io.js";
import { deserializeIpAddress } from "./socket-common.js";
import { TcpSocketImpl } from "./tcp-socket-impl.js";
import { IncomingDatagramStream, OutgoingDatagramStream, UdpSocket, udpSocketImplCreate } from "./udp-socket-impl.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

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
  MAX_SOCKET_INSTANCES = 100;

  /** @type {Network} */ networkInstance = null;
  /** @type {Map<number,Network>} */ networks = new Map();
  /** @type {Map<number,TcpSocket} */ tcpSockets = new Map();
  /** @type {Map<number,UdpSocket} */ udpSockets = new Map();

  constructor() {
    const net = this;

    class Network {
      constructor() {
        this.id = net.networkCnt++;
        net.networks.set(this.id, this);
      }
    }

    this.udp = {
      UdpSocket,
      OutgoingDatagramStream,
      IncomingDatagramStream,
    };

    class TcpSocket extends TcpSocketImpl {
      /**
       * @param {IpAddressFamily} addressFamily
       * */
      constructor(addressFamily) {
        super(addressFamily, TcpSocket, net.socketCnt++);
        net.tcpSockets.set(this.id, this);
      }
    }

    this.tcp = {
      TcpSocket,
    };

    this.instanceNetwork = {
      /**
       * @returns {Network}
       */
      instanceNetwork() {
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
      Network,
    };

    this.udpCreateSocket = {
      createUdpSocket(addressFamily) {
        assert(
          supportedAddressFamilies.includes(addressFamily) === false,
          errorCode.notSupported,
          "The specified `address-family` is not supported."
        );

        assert(
          net.socketCnt + 1 > net.MAX_SOCKET_INSTANCES,
          errorCode.newSocketLimit,
          "The new socket resource could not be created because of a system limit"
        );

        try {
          const id = net.socketCnt++;
          const updSocket = udpSocketImplCreate(addressFamily, id);
          net.udpSockets.set(id, updSocket);
          return updSocket;
        } catch (err) {
          console.log("udp socket create error", {
            err,
          });
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
        assert(
          supportedAddressFamilies.includes(addressFamily) === false,
          errorCode.notSupported,
          "The specified `address-family` is not supported."
        );

        assert(
          net.socketCnt + 1 > net.MAX_SOCKET_INSTANCES,
          errorCode.newSocketLimit,
          "The new socket resource could not be created because of a system limit"
        );

        // try {
          return new TcpSocket(addressFamily);
        // } catch (err) {
        //   // assert(true, errorCode.unknown, err);
        //   throw err;
        // }
      },
    };

    class ResolveAddressStream {
      #pollId;
      #data;
      #curItem = 0;
      #error;
      resolveNextAddress() {
        if (this.#error) throw this.#error;
        if (!this.#data) {
          const { value: addresses, error } = ioCall(SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST, this.#pollId);
          if (error) throw (this.#error = convertResolveAddressError(error));
          this.#data = addresses.map((address) => {
            const family = `ipv${isIP(address)}`;
            return {
              tag: family,
              val: deserializeIpAddress(address),
            };
          });
        }
        if (this.#curItem < this.#data.length) return this.#data[this.#curItem++];
        return undefined;
      }
      subscribe() {
        if (this.#data) return pollableCreate(0);
        return pollableCreate(this.#pollId);
      }
      [symbolDispose]() {
        if (!this.#data) ioCall(SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST);
      }
      static _create(hostname) {
        const res = new ResolveAddressStream();
        if (hostname === "0.0.0.0") {
          res.#pollId = 0;
          res.#data = { tag: "ipv4", val: [0, 0, 0, 0] };
          return res;
        } else if (hostname === "::") {
          res.#pollId = 0;
          res.#data = { tag: "ipv6", val: [0, 0, 0, 0, 0, 0, 0, 0] };
          return res;
        } else if (hostname === "::1") {
          res.#pollId = 0;
          res.#data = { tag: "ipv6", val: [0, 0, 0, 0, 0, 0, 0, 1] };
          return res;
        }
        res.#pollId = ioCall(SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST, null, {
          hostname,
        });
        return res;
      }
    }

    const resolveAddressStreamCreate = ResolveAddressStream._create;
    delete ResolveAddressStream._create;

    this.ipNameLookup = {
      ResolveAddressStream,

      /**
       *
       * @param {Network} network
       * @param {string} name
       * @returns {ResolveAddressStream}
       * @throws {invalid-argument} `name` is a syntactically invalid domain name or IP address.
       */
      resolveAddresses(network, name) {
        // TODO: bind to network
        return resolveAddressStreamCreate(name);
      },
    };
  }
}

function convertResolveAddressError(err) {
  switch (err.code) {
    default:
      return "unknown";
  }
}
