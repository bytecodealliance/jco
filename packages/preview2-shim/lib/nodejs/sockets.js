import { isIP } from "node:net";
import {
  SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST,
} from "../io/calls.js";
import { ioCall, pollableCreate } from "../io/worker-io.js";
import {
  defaultNetwork,
  ipv4ToTuple,
  ipv6ToTuple,
  mayDnsLookup,
  Network,
} from "./sockets/socket-common.js";
import { TcpSocket, createTcpSocket } from "./sockets/tcp.js";
import {
  IncomingDatagramStream,
  OutgoingDatagramStream,
  UdpSocket,
  createUdpSocket,
} from "./sockets/udp.js";

export {
  denyDnsLookup as _denyDnsLookup,
  denyTcp as _denyTcp,
  denyUdp as _denyUdp,
} from "./sockets/socket-common.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

export const udp = {
  UdpSocket,
  OutgoingDatagramStream,
  IncomingDatagramStream,
};

export const tcp = {
  TcpSocket,
};

export const instanceNetwork = {
  instanceNetwork() {
    return defaultNetwork;
  },
};

export const network = { Network };

export const udpCreateSocket = { createUdpSocket };

export const tcpCreateSocket = { createTcpSocket };

class ResolveAddressStream {
  #pollId;
  #data;
  #curItem = 0;
  #error = false;
  resolveNextAddress() {
    if (!this.#data) {
      ({ value: this.#data, error: this.#error } = ioCall(
        SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST,
        this.#pollId,
        null
      ));
    }
    if (this.#error) throw this.#data;
    if (this.#curItem < this.#data.length) return this.#data[this.#curItem++];
    return undefined;
  }
  subscribe() {
    if (this.#data) return pollableCreate(0);
    return pollableCreate(this.#pollId);
  }
  [symbolDispose]() {
    if (!this.#data) ioCall(SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST, null, null);
  }
  static _resolveAddresses(network, name) {
    if (!mayDnsLookup(network)) throw "permanent-resolver-failure";
    const res = new ResolveAddressStream();
    const isIpNum = isIP(
      name[0] === "[" && name[name.length - 1] === "]"
        ? name.slice(1, -1)
        : name
    );
    if (isIpNum > 0) {
      res.#pollId = 0;
      res.#data = [
        {
          tag: "ipv" + isIpNum,
          val: (isIpNum === 4 ? ipv4ToTuple : ipv6ToTuple)(name),
        },
      ];
    } else {
      // verify it is a valid domain name using the URL parser
      let parsedUrl = null;
      try {
        parsedUrl = new URL(`https://${name}`);
        if (
          parsedUrl.port.length ||
          parsedUrl.username.length ||
          parsedUrl.password.length ||
          parsedUrl.pathname !== "/" ||
          parsedUrl.search.length ||
          parsedUrl.hash.length
        )
          parsedUrl = null;
      } catch {
        // empty
      }
      if (!parsedUrl) {
        throw "invalid-argument";
      }
      res.#pollId = ioCall(SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST, null, name);
    }
    return res;
  }
}

const resolveAddresses = ResolveAddressStream._resolveAddresses;
delete ResolveAddressStream._resolveAddresses;

export const ipNameLookup = {
  ResolveAddressStream,
  resolveAddresses,
};
