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
  SOCKET_UDP_BIND,
  SOCKET_UDP_CHECK_SEND,
  SOCKET_UDP_CONNECT,
  SOCKET_UDP_CREATE_HANDLE,
  SOCKET_UDP_DISCONNECT,
  SOCKET_UDP_DISPOSE,
  SOCKET_UDP_GET_LOCAL_ADDRESS,
  SOCKET_UDP_GET_REMOTE_ADDRESS,
  SOCKET_UDP_RECEIVE,
  SOCKET_UDP_SEND,
  SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE,
  SOCKET_UDP_SET_SEND_BUFFER_SIZE,
  SOCKET_UDP_SET_UNICAST_HOP_LIMIT,
} from "../io/calls.js";
import {
  inputStreamCreate,
  ioCall,
  outputStreamCreate,
  pollableCreate,
} from "../io/worker-io.js";
import { platform } from "node:os";
import {
  deserializeIpAddress,
  ipv4ToTuple,
  ipv6ToTuple,
  serializeIpAddress,
} from "./sockets/socket-common.js";

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 */

/**
 * @param {IpSocketAddress} ipSocketAddress
 * @returns {boolean}
 */
function isIPv4MappedAddress(ipSocketAddress) {
  // ipv6: [0, 0, 0, 0, 0, 0xffff, 0, 0]
  if (ipSocketAddress.val.address.length !== 8) {
    return false;
  }
  return ipSocketAddress.val.address[5] === 0xffff;
}

/**
 * @param {IpSocketAddress} ipSocketAddress
 * @returns {boolean}
 */
function isMulticastIpAddress(ipSocketAddress) {
  // ipv6: [0xff00, 0, 0, 0, 0, 0, 0, 0]
  // ipv4: [0xe0, 0, 0, 0]
  return (
    ipSocketAddress.val.address[0] === 0xe0 ||
    ipSocketAddress.val.address[0] === 0xff00
  );
}

/**
 * @param {IpSocketAddress} ipSocketAddress
 * @returns {boolean}
 */
function isUnicastIpAddress(ipSocketAddress) {
  return (
    !isMulticastIpAddress(ipSocketAddress) &&
    !isBroadcastIpAddress(ipSocketAddress)
  );
}

/**
 * @param {IpSocketAddress} isWildcardAddress
 * @returns {boolean}
 */
function isWildcardAddress(ipSocketAddress) {
  // ipv6: [0, 0, 0, 0, 0, 0, 0, 0]
  // ipv4: [0, 0, 0, 0]
  return ipSocketAddress.val.address.every((segment) => segment === 0);
}

/**
 * @param {IpSocketAddress} isWildcardAddress
 * @returns {boolean}
 */
export function isBroadcastIpAddress(ipSocketAddress) {
  // ipv4: [255, 255, 255, 255]
  return (
    ipSocketAddress.val.address[0] === 0xff && // 255
    ipSocketAddress.val.address[1] === 0xff && // 255
    ipSocketAddress.val.address[2] === 0xff && // 255
    ipSocketAddress.val.address[3] === 0xff // 255
  );
}

const isWindows = platform() === "win32";
const symbolDispose = Symbol.dispose || Symbol.for("dispose");

// Network class privately stores capabilities
class Network {
  #allowDnsLookup = true;
  #allowTcp = true;
  #allowUdp = true;

  static _denyDnsLookup(network = defaultNetwork) {
    network.#allowDnsLookup = false;
  }
  static _denyTcp(network = defaultNetwork) {
    network.#allowTcp = false;
  }
  static _denyUdp(network = defaultNetwork) {
    network.#allowUdp = false;
  }
  static _mayDnsLookup(network = defaultNetwork) {
    return network.#allowDnsLookup;
  }
  static _mayTcp(network = defaultNetwork) {
    return network.#allowTcp;
  }
  static _mayUdp(network = defaultNetwork) {
    return network.#allowUdp;
  }
}

export const _denyDnsLookup = Network._denyDnsLookup;
delete Network._denyDnsLookup;

export const _denyTcp = Network._denyTcp;
delete Network._denyTcp;

export const _denyUdp = Network._denyUdp;
delete Network._denyUdp;

const mayDnsLookup = Network._mayDnsLookup;
delete Network._mayDnsLookup;

const mayTcp = Network._mayTcp;
delete Network._mayTcp;

const mayUdp = Network._mayUdp;
delete Network._mayUdp;

const defaultNetwork = new Network();

export const instanceNetwork = {
  instanceNetwork() {
    return defaultNetwork;
  },
};

export const network = { Network };

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
const SOCKET_STATE_BIND = ++stateCnt;
const SOCKET_STATE_BOUND = ++stateCnt;
const SOCKET_STATE_LISTEN = ++stateCnt; // tcp only
const SOCKET_STATE_LISTENER = ++stateCnt; // tcp only
const SOCKET_STATE_CONNECT = ++stateCnt; // tcp only
const SOCKET_STATE_CONNECTION = ++stateCnt;

// As a workaround, we store the bound address in a global map
// this is needed because 'address-in-use' is not always thrown when binding
// more than one socket to the same address
// TODO: remove this workaround when we figure out why!
const globalBoundAddresses = new Set();

class TcpSocket {
  #id;
  #network;
  #state = SOCKET_STATE_INIT;
  #bindOrConnectAddress = null;
  #serializedLocalAddress = null;
  #listenBacklogSize = 128;
  #family;

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
    const ipv4MappedAddress = isIPv4MappedAddress(remoteAddress);
    if (
      isWildcardAddress(remoteAddress) ||
      this.#family !== remoteAddress.tag ||
      !isUnicastIpAddress(remoteAddress) ||
      isMulticastIpAddress(remoteAddress) ||
      remoteAddress.val.port === 0 ||
      (this.#options.ipv6Only && ipv4MappedAddress)
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
    return ioCall(SOCKET_TCP_GET_LOCAL_ADDRESS, this.#id);
  }

  remoteAddress() {
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
    if (this.#state !== SOCKET_STATE_CONNECTION) throw "invalid-state";
    ioCall(SOCKET_TCP_SHUTDOWN, this.#id, shutdownType);
  }

  [symbolDispose]() {
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

class IncomingDatagramStream {
  #socketId;
  static _create(socketId) {
    const stream = new IncomingDatagramStream();
    stream.#socketId = socketId;
    return stream;
  }

  receive(maxResults) {
    if (maxResults === 0n) {
      return [];
    }

    const datagrams = ioCall(
      SOCKET_UDP_RECEIVE,
      // socket that's receiving the datagrams
      this.#socketId,
      {
        maxResults,
      }
    );

    return datagrams.map(({ data, rinfo }) => {
      let address = rinfo.address;
      if (rinfo._address) {
        // set the original address that the socket was bound to
        address = rinfo._address;
      }
      const remoteAddress = {
        tag: rinfo.family,
        val: {
          address: deserializeIpAddress(address, rinfo.family),
          port: rinfo.port,
        },
      };
      return {
        data,
        remoteAddress,
      };
    });
  }

  subscribe() {
    if (this.#socketId) return pollableCreate(this.#socketId);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    // TODO: stop receiving
  }
}
const incomingDatagramStreamCreate = IncomingDatagramStream._create;
delete IncomingDatagramStream._create;

class OutgoingDatagramStream {
  pollId = 0;
  #socketId = 0;

  static _create(socketId) {
    const stream = new OutgoingDatagramStream(socketId);
    stream.#socketId = socketId;
    return stream;
  }

  /**
   *
   * @returns {bigint}
   */
  checkSend() {
    const ret = ioCall(SOCKET_UDP_CHECK_SEND, this.#socketId, null);
    // TODO: When this function returns ok(0), the `subscribe` pollable will
    // become ready when this function will report at least ok(1), or an
    // error.
    return ret;
  }

  send(datagrams) {
    if (datagrams.length === 0) {
      return 0n;
    }

    let datagramsSent = 0n;

    for (const datagram of datagrams) {
      const { data, remoteAddress } = datagram;
      const remotePort = remoteAddress?.val?.port || undefined;
      const host = serializeIpAddress(remoteAddress, false);

      if (this.checkSend() < data.length) throw "datagram-too-large";
      // TODO: add the other assertions

      const ret = ioCall(
        SOCKET_UDP_SEND,
        this.#socketId, // socket that's sending the datagrams
        {
          data,
          remotePort,
          remoteHost: host,
        }
      );
      if (ret === 0) {
        datagramsSent++;
      } else {
        if (ret === -65) throw "remote-unreachable";
      }
    }

    return datagramsSent;
  }

  subscribe() {
    if (this.pollId) return pollableCreate(this.pollId);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    // TODO: stop sending
  }
}
const outgoingDatagramStreamCreate = OutgoingDatagramStream._create;
delete OutgoingDatagramStream._create;

class UdpSocket {
  #id;
  #network;
  #state = SOCKET_STATE_INIT;
  #bindOrConnectAddress = null;
  #serializedLocalAddress = null;
  #family;

  #options = {
    ipv6Only: false,
    // These default configurations will override the default
    // system ones. This is because we are unable to get the configuration
    // value for unbound sockets in Node.js, therefore we always
    // enforce these local default values from the start.
    // Like for TCP, configuration of these JCO defaults can be added in future.
    unicastHopLimit: 64,
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
    const socket = new UdpSocket();
    socket.#id = id;
    socket.#family = addressFamily;
    return socket;
  }

  startBind(network, localAddress) {
    if (!mayUdp(network)) throw "access-denied";
    if (this.#state !== SOCKET_STATE_INIT) throw "invalid-state";
    if (
      this.#family !== localAddress.tag ||
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
      (this.#serializedLocalAddress = ioCall(SOCKET_UDP_BIND, this.#id, {
        localAddress: this.#bindOrConnectAddress,
        isIpV6Only: this.#options.ipv6Only,
        unicastHopLimit: this.#options.unicastHopLimit,
        receiveBufferSize: this.#options.receiveBufferSize,
        sendBufferSize: this.#options.sendBufferSize,
      }))
    );
    this.#state = SOCKET_STATE_BOUND;
  }

  stream(remoteAddress = undefined) {
    if (!mayUdp(this.#network)) throw "access-denied";
    if (this.#state !== SOCKET_STATE_BOUND && this.#state !== SOCKET_STATE_CONNECTION)
      throw "invalid-state";

    if (this.#state === SOCKET_STATE_CONNECTION) {
      // stream() can be called multiple times, so we need to disconnect first if we are already connected
      // Note: disconnect() will also reset the connection state but does not close the socket handle!
      const ret = ioCall(SOCKET_UDP_DISCONNECT, this.#id);

      if (ret === 0) {
        // this.#options.connectionState = SocketConnectionState.Closed;
        // this.#options.lastErrorState = null;
        // this.#options.isBound = false;
      }

      if (ret !== 0) throw "unknown";
    }

    if (remoteAddress) {
      if (
        remoteAddress === undefined
        // || this.#options.connectionState === SocketConnectionState.Connected
      ) {
        this.#options.remoteAddress = undefined;
        this.#options.remotePort = 0;
        return;
      }

      if (isWildcardAddress(remoteAddress)) throw "invalid-argument";
      if (isIPv4MappedAddress(remoteAddress) && this.ipv6Only())
        throw "invalid-argument";
      if (remoteAddress.val.port === 0) throw "invalid-argument";

      const host = serializeIpAddress(remoteAddress);
      const ipFamily = `ipv${isIP(host)}`;

      if (ipFamily === "ipv0") throw "invalid-argument";
      if (this.#family !== ipFamily) throw "invalid-argument";

      const { port } = remoteAddress.val;
      this.#options.remoteAddress = host; // can be undefined
      this.#options.remotePort = port;
      // this.#options.connectionState = SocketConnectionState.Connecting;

      if (host === undefined) {
        return;
      }

      if (this.#options.isBound === false) {
        // this.bind(this.network, this.#options.localIpSocketAddress);
      }

      const err = ioCall(SOCKET_UDP_CONNECT, this.#id, {
        remoteAddress: host,
        remotePort: port,
      });

      if (!err) {
        // this.#options.connectionState = SocketConnectionState.Connected;
      } else {
        if (err === -22) throw "invalid-argument";
        throw "unknown";
      }
    }

    // reconfigure remote host and port.
    // Note: remoteAddress can be undefined
    // const host = serializeIpAddress(remoteAddress);
    // const { port } = remoteAddress?.val || { port: 0 };
    // this.#options.remoteAddress = host; // host can be undefined
    // this.#options.remotePort = port;

    this.#state = SOCKET_STATE_CONNECTION;

    return [
      incomingDatagramStreamCreate(this.#id),
      outgoingDatagramStreamCreate(this.#id),
    ];
  }

  localAddress() {
    return ioCall(SOCKET_UDP_GET_LOCAL_ADDRESS, this.#id);
  }

  remoteAddress() {
    return ioCall(SOCKET_UDP_GET_REMOTE_ADDRESS, this.#id);
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

  unicastHopLimit() {
    return this.#options.unicastHopLimit;
  }

  setUnicastHopLimit(value) {
    if (value < 1) throw "invalid-argument";
    this.#options.unicastHopLimit = value;
    if (this.#state > SOCKET_STATE_BIND) {
      ioCall(SOCKET_UDP_SET_UNICAST_HOP_LIMIT, this.#id, value);
    }
  }

  receiveBufferSize() {
    return this.#options.receiveBufferSize;
  }

  setReceiveBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    this.#options.receiveBufferSize = value;
    if (this.#state > SOCKET_STATE_BIND) {
      ioCall(SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE, this.#id, value);
    }
  }

  sendBufferSize() {
    return this.#options.sendBufferSize;
  }

  setSendBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    this.#options.sendBufferSize = value;
    if (this.#state > SOCKET_STATE_BIND) {
      ioCall(SOCKET_UDP_SET_SEND_BUFFER_SIZE, this.#id, value);
    }
  }

  subscribe() {
    if (this.#id) return pollableCreate(this.#id);
    return pollableCreate(0);
  }

  [symbolDispose]() {
    ioCall(SOCKET_UDP_DISPOSE, this.#id, null);
    if (this.#serializedLocalAddress)
      globalBoundAddresses.delete(this.#serializedLocalAddress);
  }
}

const udpSocketCreate = UdpSocket._create;
delete UdpSocket._create;

export const udpCreateSocket = {
  createUdpSocket(addressFamily) {
    return udpSocketCreate(
      addressFamily,
      ioCall(SOCKET_UDP_CREATE_HANDLE, null, null)
    );
  },
};

export const udp = {
  UdpSocket,
  OutgoingDatagramStream,
  IncomingDatagramStream,
};
