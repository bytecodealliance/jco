import { StreamReader, StreamWriter, stream } from "./stream.js";
import { FutureReader, future } from "./future.js";
import { ResourceWorker } from "./resource-worker.js";

import {
  isWildcardIpAddress,
  isUnicastIpAddress,
  isMulticastIpAddress,
  isIpv4MappedAddress,
  IP_ADDRESS_FAMILY,
} from "./socket-address.js";

const _worker = new ResourceWorker(new URL("./sockets-worker.js", import.meta.url));

const STATE = {
  UNBOUND: "unbound",
  BOUND: "bound",
  LISTENING: "listening",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  CLOSED: "closed",
};

export class TcpSocket {
  #socketId = null;
  #family = null;
  #state = "unbound";
  #options = {
    // defaults per https://nodejs.org/docs/latest/api/net.html#socketsetkeepaliveenable-initialdelay
    keepAliveEnabled: false,

    // Node.js doesn't give us the ability to detect the OS default,
    // therefore we hardcode the default value instead of using the OS default,
    // since we would never be able to report it as a return value otherwise.
    // We could make this configurable as a global JCO implementation configuration
    // instead.
    keepAliveIdleTime: 7200_000_000_000n,

    // The following options are NOT configurable in Node.js!
    // Any configurations set will respond correctly, but underneath retain
    // system / Node.js defaults.
    keepAliveInterval: 1_000_000_000n,
    keepAliveCount: 10,
    hopLimit: 1,

    // For sendBufferSize and receiveBufferSize we can at least
    // use the system defaults, but still we can't support setting them.
    receiveBufferSize: undefined,
    sendBufferSize: undefined,
  };

  // Create a new TCP socket
  // WIT: constructor(address-family: ip-address-family)
  static _create(addressFamily, socketId) {
    const socket = new TcpSocket();
    socket.#family = addressFamily;
    socket.#socketId = socketId;
    return socket;
  }

  // Bind the socket to a local address
  // WIT: bind: func(local-address: ip-socket-address) -> result<_, error-code>
  async bind(localAddress) {
    if (this.#state !== STATE.UNBOUND) {
      throw "invalid-state";
    }

    if (!this.#isValidLocalAddress(localAddress)) {
      throw "invalid-argument";
    }
    try {
      await _worker.runOp({
        op: "tcp-bind",
        localAddress,
        socketId: this.#socketId,
      });

      this.#state = STATE.BOUND;
    } catch (error) {
      throw mapError(error);
    }
  }

  // Connect to a remote endpoint
  // WIT: connect: func(remote-address: ip-socket-address) -> result<_, error-code>
  async connect(remoteAddress) {
    if (
      this.#state === STATE.CONNECTING ||
      this.#state === STATE.CONNECTED ||
      this.#state === STATE.LISTENING
    ) {
      throw "invalid-state";
    }

    if (!this.#isValidRemoteAddress(remoteAddress)) {
      throw "invalid-argument";
    }

    this.#state = STATE.CONNECTING;

    try {
      await _worker.runOp({
        op: "tcp-connect",
        remoteAddress,
        socketId: this.#socketId,
      });

      this.#state = STATE.CONNECTED;
    } catch (error) {
      this.#state = STATE.CLOSED;
      throw mapError(error);
    }
  }

  // Start listening for connections
  // WIT: listen: func() -> result<stream<tcp-socket>, error-code>
  async listen() {
    if (this.#state === STATE.LISTENING || this.#state === STATE.CONNECTED) {
      throw "invalid-state";
    }
    try {
      // Convert incoming connections from worker to TcpSocket instances
      const transform = new TransformStream({
        transform({ family, socketId }, controller) {
          const socket = tcpSocketCreate(family, socketId);
          controller.enqueue(socket);
        },
      });

      const result = await _worker.runOp(
        {
          op: "tcp-listen",
          socketId: this.#socketId,
          stream: transform.writable,
        },
        [transform.writable],
      );

      this.#state = STATE.LISTENING;
      return StreamReader(transform.readable);
    } catch (error) {
      this.#state = STATE.CLOSED;
      throw mapError(error);
    }
  }

  // Send data to the connected peer
  // WIT: send: func(data: stream<u8>) -> result<_, error-code>
  async send(data) {
    if (this.#state !== STATE.CONNECTED) {
      throw "invalid-state";
    }

    if (data === null || typeof data !== "StreamReader") {
      throw "invalid-argument";
    }
    const stream = data.intoStream();

    try {
      // Transfer the stream to the worker
      await _worker.runOp(
        {
          op: "tcp-send",
          socketId: this.#socketId,
          stream,
        },
        [stream],
      );
    } catch (error) {
      throw mapError(error);
    }
  }

  // Receive data from the connected peer
  // WIT: receive: func() -> tuple<stream<u8>, future<result<_, error-code>>>
  receive() {
    if (this.#state !== STATE.CONNECTED) {
      throw new Error("Socket not connected");
    }

    const transform = new TransformStream();
    const promise = _worker
      .runOp(
        {
          op: "tcp-receive",
          socketId: this.#socketId,
          stream: transform.writable,
        },
        [transform.writable],
      )
      .catch((err) => {
        throw mapError(err);
      });

    return [new StreamReader(transform.readable), new FutureReader(promise)];
  }

  // Get the bound local address
  // WIT: local-address: func() -> result<ip-socket-address, error-code>
  async localAddress() {
    if (this.#state === STATE.UNBOUND) {
      throw "invalid-state";
    }

    try {
      return await _worker.runOp({
        op: "tcp-get-local-address",
        socketId: this.#socketId,
      });
    } catch (err) {
      throw mapError(err);
    }
  }

  // Get the remote address
  // WIT: remote-address: func() -> result<ip-socket-address, error-code>
  async remoteAddress() {
    if (this.#state !== STATE.CONNECTED) {
      throw "invalid-state";
    }

    try {
      return await _worker.runOp({
        op: "tcp-get-remote-address",
        socketId: this.#socketId,
      });
    } catch (err) {
      throw mapError(err);
    }
  }

  // Check if socket is in listening state
  // WIT: is-listening: func() -> bool
  isListening() {
    return this.#state === STATE.LISTENING;
  }

  // Get address family
  // WIT: address-family: func() -> ip-address-family
  addressFamily() {
    return this.#family;
  }

  // Set listen backlog size
  // WIT: set-listen-backlog-size: func(value: u64) -> result<_, error-code>
  async setListenBacklogSize(value) {
    if (value === 0n) {
      throw "invalid-argument";
    }

    if (this.#state === STATE.CONNECTING || this.#state === STATE.CONNECTED) {
      throw "not-supported";
    }

    if (this.#state !== STATE.UNBOUND && this.#state !== STATE.BOUND) {
      throw "invalid-state";
    }

    this.#options.listenBacklogSize = Number(value);
    try {
      await _worker.runOp({
        op: "tcp-set-listen-backlog-size",
        socketId: this.#socketId,
        value,
      });
    } catch (err) {
      throw mapError(err);
    }
  }

  // Get whether keep alive is enabled
  // WIT: keep-alive-enabled: func() -> result<bool, error-code>
  async keepAliveEnabled() {
    return this.#options.keepAliveEnabled;
  }

  // Set keep alive enabled
  // WIT: set-keep-alive-enabled: func(value: bool) -> result<_, error-code>
  async setKeepAliveEnabled(value) {
    try {
      this.#options.keepAliveEnabled = value;

      await _worker.runOp({
        op: "tcp-set-keep-alive",
        socketId: this.#socketId,
        keepAliveEnabled: this.#options.keepAliveEnabled,
        keepAliveIdleTime: this.#options.keepAliveIdleTime,
      });
    } catch (err) {
      throw mapError(err);
    }
  }

  // Get keep alive idle time
  // WIT: keep-alive-idle-time: func() -> result<duration, error-code>
  async keepAliveIdleTime() {
    return this.#options.keepAliveIdleTime;
  }

  // Set keep alive idle time
  // WIT: set-keep-alive-idle-time: func(value: duration) -> result<_, error-code>
  async setKeepAliveIdleTime(value) {
    if (value < 1n) {
      throw "invalid-argument";
    }

    if (value < 1_000_000_000n) {
      value = 1_000_000_000n;
    }

    if (
      value === this.#options.keepAliveIdleTime ||
      !this.#options.keepAliveEnabled
    ) {
      return;
    }

    this.#options.keepAliveIdleTime = value;

    try {
      await _worker.runOp({
        op: "tcp-set-keep-alive",
        socketId: this.#socketId,
        keepAliveEnabled: this.#options.keepAliveEnabled,
        keepAliveIdleTime: this.#options.keepAliveIdleTime,
      });
    } catch (err) {
      throw mapError(err);
    }
  }

  // Get keep alive interval
  // WIT: keep-alive-interval: func() -> result<duration, error-code>
  async keepAliveInterval() {
    return this.#options.keepAliveInterval;
  }

  // Set keep alive interval
  // WIT: set-keep-alive-interval: func(value: duration) -> result<_, error-code>
  async setKeepAliveInterval(value) {
    if (value < 1n) throw "invalid-argument";
    this.#options.keepAliveInterval = value;
  }

  // Get keep alive count
  // WIT: keep-alive-count: func() -> result<u32, error-code>
  async keepAliveCount() {
    return this.#options.keepAliveCount;
  }

  // Set keep alive count
  // WIT: set-keep-alive-count: func(value: u32) -> result<_, error-code>
  async setKeepAliveCount(value) {
    if (value < 1n) throw "invalid-argument";
    this.#options.keepAliveCount = value;
  }

  // Get hop limit
  // WIT: hop-limit: func() -> result<u8, error-code>
  async hopLimit() {
    return this.#options.hopLimit;
  }

  // Set hop limit
  // WIT: set-hop-limit: func(value: u8) -> result<_, error-code>
  async setHopLimit(value) {
    if (value < 1n) throw "invalid-argument";
    this.#options.hopLimit = value;
  }

  // Get receive buffer size
  // WIT: receive-buffer-size: func() -> result<u64, error-code>
  async receiveBufferSize() {
    if (this.#options.receiveBufferSize) {
      return this.#options.receiveBufferSize;
    }

    try {
      const result = await _worker.runOp({
        op: "tcp-recv-buffer-size",
        socketId: this.#socketId,
      });

      this.#options.receiveBufferSize = result;
      return result;
    } catch (err) {
      throw mapError(err);
    }
  }

  // Set receive buffer size
  // WIT: set-receive-buffer-size: func(value: u64) -> result<_, error-code>
  async setReceiveBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    this.#options.receiveBufferSize = value;
  }

  // Get send buffer size
  // WIT: send-buffer-size: func() -> result<u64, error-code>
  async sendBufferSize() {
    if (this.#options.sendBufferSize) {
      return this.#options.sendBufferSize;
    }

    try {
      const result = await _worker.runOp({
        op: "tcp-send-buffer-size",
        socketId: this.#socketId,
      });

      this.#options.sendBufferSize = result;
      return result;
    } catch (err) {
      throw mapError(err);
    }
  }

  // Set send buffer size
  // WIT: set-send-buffer-size: func(value: u64) -> result<_, error-code>
  async setSendBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    this.#options.sendBufferSize = value;
  }

  [Symbol.dispose]() {
    if (this.#socketId) {
      void _worker.runOp({
        op: "tcp-dispose",
        socketId: this.#socketId,
      });
    }

    this.#socketId = null;
    this.#state = STATE.CLOSED;
  }

  #isValidLocalAddress(localAddress) {
    return (
      this.#family === localAddress.tag &&
      isUnicastIpAddress(localAddress) &&
      !isIpv4MappedAddress(localAddress)
    );
  }

  #isValidRemoteAddress(remoteAddress) {
    return (
      this.#family === remoteAddress.tag &&
      remoteAddress.val.port !== 0 &&
      isUnicastIpAddress(remoteAddress) &&
      !isWildcardIpAddress(remoteAddress) &&
      !isMulticastIpAddress(remoteAddress) &&
      !isIpv4MappedAddress(remoteAddress)
    );
  }
}

const tcpSocketCreate = TcpSocket._create;
delete TcpSocket._create;

export const tcpCreateSocket = {
  async createTcpSocket(addressFamily) {
    if (
      addressFamily !== IP_ADDRESS_FAMILY.IPV4 &&
      addressFamily !== IP_ADDRESS_FAMILY.IPV6
    ) {
      throw "invalid-argument";
    }

    try {
      const result = await _worker.runOp({
        op: "tcp-create",
        family: addressFamily,
      });

      return tcpSocketCreate(addressFamily, result.socketId);
    } catch (error) {
      console.error("Failed to create socket:", error);
      throw mapError(error);
    }
  },
};

export { IP_ADDRESS_FAMILY } from "./socket-address.js";

export const ERROR_MAP = {
  EACCES: "access-denied",
  EPERM: "access-denied",
  EOPNOTSUPP: "not-supported",
  EINVAL: "invalid-argument",
  ENOMEM: "out-of-memory",
  ENOBUFS: "out-of-memory",
  EAI_MEMORY: "out-of-memory",
  ETIMEDOUT: "timeout",
  EADDRINUSE: "address-in-use",
  EADDRNOTAVAIL: "address-not-bindable",
  EHOSTUNREACH: "remote-unreachable",
  ENETUNREACH: "remote-unreachable",
  ENETDOWN: "remote-unreachable",
  ECONNREFUSED: "connection-refused",
  ECONNRESET: "connection-reset",
  ECONNABORTED: "connection-aborted",
  EMSGSIZE: "datagram-too-large",
  ENOTCONN: "invalid-state",
  EISCONN: "invalid-state",
  EALREADY: "invalid-state",
  EDESTADDRREQ: "invalid-argument",
};

function mapError(err) {
  if (typeof err === "string") {
    return ERROR_MAP[err] || "unknown";
  }

  if (err instanceof Error && err.code) {
    return ERROR_MAP[err.code] || "unknown";
  }

  return "unknown";
}
