import { isIP } from "node:net";
import {
  SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST,
  SOCKET_TCP_ACCEPT,
  SOCKET_TCP_BIND,
  SOCKET_TCP_CONNECT,
  SOCKET_TCP_CREATE_HANDLE,
  SOCKET_TCP_DISPOSE,
  SOCKET_TCP_GET_LOCAL_ADDRESS,
  SOCKET_TCP_GET_REMOTE_ADDRESS,
  SOCKET_TCP_LISTEN,
  SOCKET_TCP_SET_KEEP_ALIVE,
  SOCKET_TCP_SHUTDOWN,
  SOCKET_TCP_SUBSCRIBE,
  SOCKET_TCP,
} from "../io/calls.js";
import {
  inputStreamCreate,
  ioCall,
  outputStreamCreate,
  pollableCreate,
} from "../io/worker-io.js";
import {
  defaultNetwork,
  ipv4ToTuple,
  ipv6ToTuple,
  isIPv4MappedAddress,
  isMulticastIpAddress,
  isUnicastIpAddress,
  isWildcardAddress,
  mayDnsLookup,
  mayTcp,
  Network,
  serializeIpAddress,
} from "./sockets/socket-common.js";
import {
  IncomingDatagramStream,
  OutgoingDatagramStream,
  UdpSocket,
  createUdpSocket,
} from "./sockets/udp.js";
import { platform } from "node:os";

export {
  denyDnsLookup as _denyDnsLookup,
  denyTcp as _denyTcp,
  denyUdp as _denyUdp,
} from "./sockets/socket-common.js";

const isWindows = platform() === "win32";
const symbolDispose = Symbol.dispose || Symbol.for("dispose");

export const udp = {
  UdpSocket,
  OutgoingDatagramStream,
  IncomingDatagramStream,
};

export const instanceNetwork = {
  instanceNetwork() {
    return defaultNetwork;
  },
};

export const network = { Network };

export const udpCreateSocket = { createUdpSocket };

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

let stateCnt = 0;
const SOCKET_STATE_INIT = ++stateCnt;
// const SOCKET_STATE_ERROR = ++stateCnt;
const SOCKET_STATE_BIND = ++stateCnt;
const SOCKET_STATE_BOUND = ++stateCnt;
const SOCKET_STATE_LISTEN = ++stateCnt;
const SOCKET_STATE_LISTENER = ++stateCnt;
const SOCKET_STATE_CONNECT = ++stateCnt;
const SOCKET_STATE_CONNECTION = ++stateCnt;

const STATE_MASK = 0xff;

const SOCKET_STATE_OPEN = 3 << 8; // = READABLE | WRITABLE
const SOCKET_STATE_READABLE = 1 << 8;
const SOCKET_STATE_WRITABLE = 2 << 8;
const SOCKET_STATE_CLOSED = 4 << 8;

// As a workaround, we store the bound address in a global map
// this is needed because 'address-in-use' is not always thrown when binding
// more than one socket to the same address
// TODO: remove this workaround when we figure out why!
const globalBoundAddresses = new Set();

class TcpSocket {
  #network;
  #id;

  #state = SOCKET_STATE_INIT;

  #bindOrConnectAddress = null;
  #serializedLocalAddress = null;

  #listenBacklogSize = 128;

  #family;

  // these options are exactly the ones which copy on accept
  #options = {
    ipv6Only: false,

    // defaults per https://nodejs.org/docs/latest/api/net.html#socketsetkeepaliveenable-initialdelay
    keepAlive: false,
    // Node.js doesn't give us the ability to alter keepAliveCount, instead
    // if will always be 10 regardless of configuration.
    keepAliveCount: 10,
    // Node.js doesn't give us the ability to detect the OS default,
    // therefore we hardcode the default value instead of using the OS default,
    // since we would never be able to report it as a return value otherwise.
    // We could make this configurable as a local configuration instead.
    keepAliveIdleTime: 7200_000_000_000n,
    // Node.js doesn't give us the ability to alter keepAliveInterval, instead
    // it will always be 1 second regardless of configuration.
    keepAliveInterval: 1_000_000_000n,

    hopLimit: 1,

    // Node.js does not allow customizing these for TCP, so while we
    // support configuration, it will underneath retain the OS default
    receiveBufferSize: 8192n,
    sendBufferSize: 8192n,
  };

  /**
   * @param {IpAddressFamily} addressFamily
   * @param {number} id
   * @returns {TcpSocket}
   */
  static _create(addressFamily, id) {
    if (addressFamily !== "ipv4" && addressFamily !== "ipv6")
      throw "not-supported";
    const socket = new TcpSocket();
    socket.#id = id;
    socket.#family = addressFamily;
    return socket;
  }

  startBind(network, localAddress) {
    if (!mayTcp(network)) throw "access-denied";
    if (this.#state !== SOCKET_STATE_INIT) throw "invalid-state";
    if (
      this.#family !== localAddress.tag ||
      !isUnicastIpAddress(localAddress) ||
      (isIPv4MappedAddress(localAddress) && this.ipv6Only())
    )
      throw "invalid-argument";
    this.#bindOrConnectAddress = localAddress;
    this.#network = network;
    this.#state = SOCKET_STATE_BIND;
  }

  finishBind() {
    if (this.#state !== SOCKET_STATE_BIND) throw "not-in-progress";
    if (
      globalBoundAddresses.has(
        serializeIpAddress(this.#bindOrConnectAddress, true)
      )
    )
      throw "address-in-use";

    globalBoundAddresses.add(
      (this.#serializedLocalAddress = ioCall(SOCKET_TCP_BIND, this.#id, {
        localAddress: this.#bindOrConnectAddress,
        isIpV6Only: this.#options.ipv6Only,
      }))
    );

    this.#state = SOCKET_STATE_BOUND;
  }

  startConnect(network, remoteAddress) {
    if (!mayTcp(network)) throw "access-denied";
    if (this.#network && network !== this.#network) throw "invalid-argument";
    if (remoteAddress.val.port === 0 && isWindows) throw "invalid-argument";
    if (this.#state !== SOCKET_STATE_INIT && this.#state !== SOCKET_STATE_BOUND)
      throw "invalid-state";
    const isIpv4MappedAddress = isIPv4MappedAddress(remoteAddress);
    if (
      isWildcardAddress(remoteAddress) ||
      this.#family !== remoteAddress.tag ||
      !isUnicastIpAddress(remoteAddress) ||
      isMulticastIpAddress(remoteAddress) ||
      remoteAddress.val.port === 0 ||
      (this.#options.ipv6Only && isIpv4MappedAddress)
    ) {
      throw "invalid-argument";
    }

    this.#bindOrConnectAddress = remoteAddress;
    this.#network = network;
    this.#state = SOCKET_STATE_CONNECT;
  }

  finishConnect() {
    if (this.#state !== SOCKET_STATE_CONNECT) throw "not-in-progress";
    const needLocalAddress = this.#serializedLocalAddress === null;
    const [inputStreamId, outputStreamId, localAddress] = ioCall(
      SOCKET_TCP_CONNECT,
      this.#id,
      this.#bindOrConnectAddress,
      this.#serializedLocalAddress === null
    );
    if (needLocalAddress)
      globalBoundAddresses.add((this.#serializedLocalAddress = localAddress));
    this.#state = SOCKET_STATE_CONNECTION;
    return [
      inputStreamCreate(SOCKET_TCP, inputStreamId),
      outputStreamCreate(SOCKET_TCP, outputStreamId),
    ];
  }

  startListen() {
    if (!mayTcp(this.#network)) throw "access-denied";
    if (this.#state !== SOCKET_STATE_BOUND) throw "invalid-state";
    this.#state = SOCKET_STATE_LISTEN;
  }

  finishListen() {
    if (this.#state !== SOCKET_STATE_LISTEN) throw "not-in-progress";
    ioCall(SOCKET_TCP_LISTEN, this.#id, this.#listenBacklogSize);
    this.#state = SOCKET_STATE_LISTENER;
  }

  accept() {
    if (!mayTcp(this.#network)) throw "access-denied";

    if (this.#state !== SOCKET_STATE_LISTENER) throw "invalid-state";

    const [socketId, inputStreamId, outputStreamId] = ioCall(
      SOCKET_TCP_ACCEPT,
      this.#id,
      null
    );

    const socket = tcpSocketCreate(this.#family, socketId);
    socket.#state = SOCKET_STATE_CONNECTION;

    Object.assign(socket.#options, this.#options);

    return [
      socket,
      inputStreamCreate(SOCKET_TCP, inputStreamId),
      outputStreamCreate(SOCKET_TCP, outputStreamId),
    ];
  }

  localAddress() {
    if (
      this.#state !== SOCKET_STATE_BOUND &&
      this.#state !== SOCKET_STATE_CONNECTION &&
      this.#state !== SOCKET_STATE_LISTENER
    )
      throw "invalid-state";
    return ioCall(SOCKET_TCP_GET_LOCAL_ADDRESS, this.#id);
  }

  remoteAddress() {
    if ((this.#state & STATE_MASK) !== SOCKET_STATE_CONNECTION)
      throw "invalid-state";
    return ioCall(SOCKET_TCP_GET_REMOTE_ADDRESS, this.#id);
  }

  isListening() {
    return this.#state === SOCKET_STATE_LISTENER;
  }

  addressFamily() {
    return this.#family;
  }

  ipv6Only() {
    if (this.#family === "ipv4") throw "not-supported";
    return this.#options.ipv6Only;
  }

  setIpv6Only(value) {
    if (this.#family === "ipv4") throw "not-supported";
    if (this.#state !== SOCKET_STATE_INIT) throw "invalid-state";
    this.#options.ipv6Only = value;
  }

  setListenBacklogSize(value) {
    if (value === 0n) throw "invalid-argument";
    if (
      this.#state === SOCKET_STATE_LISTEN ||
      this.#state === SOCKET_STATE_LISTENER
    )
      throw "not-supported";
    if (
      this.#state !== SOCKET_STATE_INIT &&
      this.#state !== SOCKET_STATE_BIND &&
      this.#state !== SOCKET_STATE_BOUND
    )
      throw "invalid-state";
    this.#listenBacklogSize = Number(value);
  }

  keepAliveEnabled() {
    return this.#options.keepAlive;
  }

  setKeepAliveEnabled(value) {
    this.#options.keepAlive = value;
    ioCall(SOCKET_TCP_SET_KEEP_ALIVE, this.#id, {
      keepAlive: value,
      keepAliveIdleTime: this.#options.keepAliveIdleTime,
    });
  }

  keepAliveIdleTime() {
    return this.#options.keepAliveIdleTime;
  }

  setKeepAliveIdleTime(value) {
    if (value < 1n) throw "invalid-argument";
    if (value < 1_000_000_000n) value = 1_000_000_000n;
    if (value !== this.#options.keepAliveIdleTime) {
      this.#options.keepAliveIdleTime = value;
      if (this.#options.keepAlive) {
        ioCall(SOCKET_TCP_SET_KEEP_ALIVE, this.#id, {
          keepAlive: true,
          keepAliveIdleTime: this.#options.keepAliveIdleTime,
        });
      }
    }
  }

  keepAliveInterval() {
    return this.#options.keepAliveInterval;
  }

  setKeepAliveInterval(value) {
    if (value < 1n) throw "invalid-argument";
    this.#options.keepAliveInterval = value;
  }

  keepAliveCount() {
    return this.#options.keepAliveCount;
  }

  setKeepAliveCount(value) {
    if (value < 1) throw "invalid-argument";
    this.#options.keepAliveCount = value;
  }

  hopLimit() {
    return this.#options.hopLimit;
  }

  setHopLimit(value) {
    value = Number(value);
    if (value < 1) throw "invalid-argument";
    this.#options.hopLimit = value;
  }

  receiveBufferSize() {
    return this.#options.receiveBufferSize;
  }

  setReceiveBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    this.#options.receiveBufferSize = value;
  }

  sendBufferSize() {
    return this.#options.sendBufferSize;
  }

  setSendBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    this.#options.sendBufferSize = value;
  }

  subscribe() {
    return pollableCreate(ioCall(SOCKET_TCP_SUBSCRIBE, this.#id, null));
  }

  shutdown(shutdownType) {
    if ((this.#state & (SOCKET_STATE_OPEN === 0)) === 0) throw "invalid-state";

    const err = ioCall(SOCKET_TCP_SHUTDOWN, this.#id, shutdownType);

    if (err === 1) throw "invalid-state";

    console.log(shutdownType);

    // TODO: figure out how to handle shutdownTypes
    if (shutdownType === "receive") {
      this.#state &= ~SOCKET_STATE_READABLE;
    } else if (shutdownType === "send") {
      this.#state &= ~SOCKET_STATE_WRITABLE;
    } else if (shutdownType === "both") {
      this.#state &= ~SOCKET_STATE_OPEN;
      this.#state |= SOCKET_STATE_CLOSED;
    }
  }

  [symbolDispose]() {
    this.#state = SOCKET_STATE_CLOSED;
    ioCall(SOCKET_TCP_DISPOSE, this.#id, null);
    if (this.#serializedLocalAddress)
      globalBoundAddresses.delete(this.#serializedLocalAddress);
  }
}

const tcpSocketCreate = TcpSocket._create;
delete TcpSocket._create;

export const tcpCreateSocket = {
  createTcpSocket(addressFamily) {
    return tcpSocketCreate(
      addressFamily,
      ioCall(SOCKET_TCP_CREATE_HANDLE, null, null)
    );
  },
};

export const tcp = {
  TcpSocket,
};
