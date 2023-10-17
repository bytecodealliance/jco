/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").Network} Network
 * @typedef {import("../../types/interfaces/wasi-sockets-network").ErrorCode} ErrorCode
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 */

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

/** @type {IpAddressFamily} */
export const ipAddressFamily = {
  ipv4: "ipv4",
  ipv6: "ipv6",
};

export class WasiSockets {
  networkCnt = 0;

  /** @type {Map<number,Network>} */ networks = new Map();

  constructor() {
    const net = this;
    this.networks = new Map();

    class Network {
      /** @type {number} */ id;
      constructor() {
        this.id = net.networkCnt++;
      }
    }

    this.instanceNetwork = {
      /**
       * @returns Network
       */
      instanceNetwork() {
        console.log(`[sockets] instance network`);

        let _network;
        if (!_network) {
          _network = new Network();
        }
        return _network;
      },
    };

    this.network = {
      /**
       * @param {Network} networkId
       **/
      dropNetwork(networkId) {
        console.log(`[network] Drop network ${networkId}`);

        const network = net.networks.get(networkId);
        if (!network) {
          return;
        }
        net.networks.delete(networkId);
      },
    };
  }
}
