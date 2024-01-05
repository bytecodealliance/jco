import { isIP } from "node:net";
import {
  SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST,
  SOCKET_TCP_BIND,
  SOCKET_TCP_CONNECT,
  SOCKET_TCP_CREATE_HANDLE,
  SOCKET_TCP_CREATE_INPUT_STREAM,
  SOCKET_TCP_CREATE_OUTPUT_STREAM,
  SOCKET_TCP_DISPOSE,
  SOCKET_TCP_GET_LOCAL_ADDRESS,
  SOCKET_TCP_GET_REMOTE_ADDRESS,
  SOCKET_TCP_LISTEN,
  SOCKET_TCP_SET_KEEP_ALIVE,
  SOCKET_TCP_SHUTDOWN,
  SOCKET,
} from "../io/calls.js";
import {
  inputStreamCreate,
  ioCall,
  outputStreamCreate,
  pollableCreate,
} from "../io/worker-io.js";
import {
  defaultNetwork,
  findUnusedLocalAddress,
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
const SOCKET_STATE_ERROR = ++stateCnt;
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
  #error = null;

  #bindOrConnectAddress = null;
  #serializedLocalAddress = null;

  // See: https://github.com/torvalds/linux/blob/fe3cfe869d5e0453754cf2b4c75110276b5e8527/net/core/request_sock.c#L19-L31
  #listenBacklogSize = 128;

  // these options are exactly the ones which copy on accept
  #options = {
    family: "ipv4",
    ipv6Only: false,
    // TODO: what these default values should be?
    keepAlive: false,
    keepAliveCount: 1,
    keepAliveIdleTime: 1,
    keepAliveInterval: 1,
    hopLimit: 1,
    receiveBufferSize: 1,
    sendBufferSize: 1,
  };

  #isBound() {
    return (
      this.#state === SOCKET_STATE_BOUND ||
      this.#state === SOCKET_STATE_LISTEN ||
      this.#state === SOCKET_STATE_CONNECT ||
      this.#state === SOCKET_STATE_LISTENER ||
      (this.#state & STATE_MASK) == SOCKET_STATE_CONNECTION
    );
  }

  /**
   * @param {IpAddressFamily} addressFamily
   * @returns {TcpSocket}
   */
  static _create(addressFamily) {
    if (addressFamily !== "ipv4" && addressFamily !== "ipv6")
      throw "not-supported";
    const socket = new TcpSocket();
    socket.#id = ioCall(SOCKET_TCP_CREATE_HANDLE, null, null);
    socket.#options.family = addressFamily;
    return socket;
  }

  startBind(network, localAddress) {
    if (!mayTcp(network)) throw "access-denied";
    if (this.#state !== SOCKET_STATE_INIT) throw "invalid-state";
    if (
      this.#options.family !== localAddress.tag ||
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

    // todo: persist errors?
    ioCall(SOCKET_TCP_BIND, this.#id, {
      localAddress: this.#bindOrConnectAddress,
      isIpV6Only: this.#options.ipv6Only,
    });

    this.#state = SOCKET_STATE_BOUND;

    // when port is 0, the OS will assign an ephemeral IP
    // we need to get the actual IP assigned by the OS
    this.#serializedLocalAddress = serializeIpAddress(
      this.localAddress(),
      true
    );
    globalBoundAddresses.add(this.#serializedLocalAddress);
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
      this.#options.family !== remoteAddress.tag ||
      !isUnicastIpAddress(remoteAddress) ||
      isMulticastIpAddress(remoteAddress) ||
      remoteAddress.val.port === 0 ||
      (this.#options.ipv6Only && isIpv4MappedAddress)
    ) {
      throw "invalid-argument";
    }

    if (this.#state !== SOCKET_STATE_BOUND) {
      console.error('LATE BIND');
      const localAddress = findUnusedLocalAddress(
        this.#options.family,
        isIpv4MappedAddress
      );
      this.#options.localPort = localAddress.val.port;
      this.#options.localIpSocketAddress = localAddress;
      this.startBind(network, localAddress);
      this.finishBind();
    }
    this.#bindOrConnectAddress = remoteAddress;
    this.#network = network;
    this.#state = SOCKET_STATE_CONNECT;
  }

  finishConnect() {
    if (this.#state !== SOCKET_STATE_CONNECT) throw "not-in-progress";

    // todo: check error persistence
    const socketId = ioCall(SOCKET_TCP_CONNECT, this.#id, { remoteAddress: this.#bindOrConnectAddress, localAddress: this.#serializedLocalAddress });

    const inputStreamId = ioCall(SOCKET_TCP_CREATE_INPUT_STREAM, null, null);
    const outputStreamId = ioCall(SOCKET_TCP_CREATE_OUTPUT_STREAM, null, null);
    const inputStream = inputStreamCreate(SOCKET, inputStreamId);
    const outputStream = outputStreamCreate(SOCKET, outputStreamId);

    this.#state = SOCKET_STATE_CONNECTION;

    return [inputStream, outputStream];
  }

  startListen() {
    if (!mayTcp(this.#network)) throw "access-denied";
    if (!this.#isBound()) throw "invalid-state";
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

    const inputStreamId = ioCall(SOCKET_TCP_CREATE_INPUT_STREAM, null, null);
    const outputStreamId = ioCall(SOCKET_TCP_CREATE_OUTPUT_STREAM, null, null);
    const inputStream = inputStreamCreate(SOCKET, inputStreamId);
    const outputStream = outputStreamCreate(SOCKET, outputStreamId);

    const socket = createTcpSocket(this.addressFamily());

    // copy the necessary socket options
    Object.assign(socket.#options, this.#options);

    return [socket, inputStream, outputStream];
  }

  localAddress() {
    if (!this.#isBound()) throw "invalid-state";
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
    return this.#options.family;
  }

  ipv6Only() {
    if (this.#options.family === "ipv4") throw "not-supported";
    return this.#options.ipv6Only;
  }

  setIpv6Only(value) {
    if (this.#options.family === "ipv4") throw "not-supported";
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
    ioCall(SOCKET_TCP_SET_KEEP_ALIVE, this.#id, value);
    this.#options.keepAlive = value;
    if (value === true) {
      this.setKeepAliveIdleTime(this.keepAliveIdleTime());
      this.setKeepAliveInterval(this.keepAliveInterval());
      this.setKeepAliveCount(this.keepAliveCount());
    }
  }

  keepAliveIdleTime() {
    return this.#options.keepAliveIdleTime;
  }

  setKeepAliveIdleTime(value) {
    value = Number(value);
    if (value < 1) throw "invalid-argument";
    this.#options.keepAliveIdleTime = value;
  }

  keepAliveInterval() {
    return this.#options.keepAliveInterval;
  }

  setKeepAliveInterval(value) {
    value = Number(value);
    if (value < 1) throw "invalid-argument";

    this.#options.keepAliveInterval = value;
  }

  keepAliveCount() {
    return this.#options.keepAliveCount;
  }

  setKeepAliveCount(value) {
    value = Number(value);
    if (value < 1) throw "invalid-argument";
    // TODO: set this on the client socket as well
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
    return BigInt(this.#options.receiveBufferSize);
  }

  setReceiveBufferSize(value) {
    value = Number(value);

    // TODO: review these assertions based on WIT specs
    // assert(this.#state.connectionState === SocketConnectionState.Connected, "invalid-state");
    if (value === 0) throw "invalid-argument";

    // TODO: set this on the client socket as well
    this.#options.receiveBufferSize = value;
  }

  sendBufferSize() {
    return BigInt(this.#options.sendBufferSize);
  }

  setSendBufferSize(value) {
    value = Number(value);

    // TODO: review these assertions based on WIT specs
    // assert(this.#state.connectionState === SocketConnectionState.Connected, "invalid-state");
    if (value === 0) throw "invalid-argument";

    // TODO: set this on the client socket as well
    this.#options.sendBufferSize = value;
  }

  subscribe() {
    if (this.#id) return pollableCreate(this.#id);
    // 0 poll is immediately resolving
    return pollableCreate(0);
  }

  shutdown(shutdownType) {
    if (this.#state & (SOCKET_STATE_OPEN === 0)) throw "invalid-state";

    const err = ioCall(SOCKET_TCP_SHUTDOWN, this.#id, shutdownType);

    if (err === 1) throw "invalid-state";

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
    ioCall(SOCKET_TCP_DISPOSE, this.#id, null);
    // we only need to remove the bound address from the global map
    // if the socket was already bound
    if (this.#isBound())
      globalBoundAddresses.delete(this.#serializedLocalAddress);
  }
}

const createTcpSocket = TcpSocket._create;
delete TcpSocket._create;

export const tcpCreateSocket = { createTcpSocket };

export const tcp = {
  TcpSocket,
};
