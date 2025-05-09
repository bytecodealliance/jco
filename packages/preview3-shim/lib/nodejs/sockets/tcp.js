import { StreamReader, StreamWriter, stream } from "../stream.js";
import { FutureReader, future } from "../future.js";
import { ResourceWorker } from "../workers/resource-worker.js";
import { mapError } from "./error.js";

import {
  isWildcardIpAddress,
  isUnicastIpAddress,
  isMulticastIpAddress,
  isIpv4MappedAddress,
  IP_ADDRESS_FAMILY,
} from "./address.js";

const _worker = new ResourceWorker(
  new URL("../workers/tcp-worker.js", import.meta.url),
);

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

  /**
   * Creates a new TCP socket
   * WIT: constructor(address-family: ip-address-family)
   *
   * @static
   * @param {IP_ADDRESS_FAMILY} addressFamily - The IP address family (IPv4 or IPv6)
   * @param {number} socketId - The internal socket identifier
   * @returns {TcpSocket} A new TcpSocket instance
   * @private
   */
  static _create(addressFamily, socketId) {
    const socket = new TcpSocket();
    socket.#family = addressFamily;
    socket.#socketId = socketId;
    return socket;
  }

  /**
   * Binds the socket to a local address
   * WIT: bind: func(local-address: ip-socket-address) -> result<_, error-code>
   *
   * @async
   * @param {Object} localAddress - The local address to bind to
   * @returns {Promise<void>}
   * @throws {"invalid-state"} If the socket is not in unbound state
   * @throws {"invalid-argument"} If the local address is not valid
   * @throws {string} Other error codes mapped from system errors
   */
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

  /**
   * Connects to a remote endpoint
   * WIT: connect: func(remote-address: ip-socket-address) -> result<_, error-code>
   *
   * @async
   * @param {Object} remoteAddress - The remote address to connect to
   * @returns {Promise<void>}
   * @throws {"invalid-state"} If the socket is connecting, connected or listening
   * @throws {"invalid-argument"} If the remote address is not valid
   * @throws {string} Other error codes mapped from system errors
   */
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

  /**
   * Starts listening for connections
   * WIT: listen: func() -> result<stream<tcp-socket>, error-code>
   *
   * @async
   * @returns {Promise<StreamReader>} A stream of incoming TCP socket connections
   * @throws {"invalid-state"} If the socket is listening or connected
   * @throws {string} Other error codes mapped from system errors
   */
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

  /**
   * Sends data to the connected peer
   * WIT: send: func(data: stream<u8>) -> result<_, error-code>
   *
   * @async
   * @param {StreamReader} data - The data stream to send
   * @returns {Promise<void>}
   * @throws {"invalid-state"} If the socket is not connected
   * @throws {"invalid-argument"} If data is not a valid StreamReader
   * @throws {string} Other error codes mapped from system errors
   */
  async send(data) {
    if (this.#state !== STATE.CONNECTED) {
      throw "invalid-state";
    }
    if (!(data instanceof StreamReader)) {
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

  /**
   * Receives data from the connected peer
   * WIT: receive: func() -> tuple<stream<u8>, future<result<_, error-code>>>
   *
   * @throws {"invalid-state"} If the socket is not connected
   * @returns {[StreamReader, FutureReader]} A tuple containing the data stream and a future
   */
  receive() {
    if (this.#state !== STATE.CONNECTED) {
      throw "invalid-state";
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

  /**
   * Gets the bound local address
   * WIT: local-address: func() -> result<ip-socket-address, error-code>
   *
   * @async
   * @returns {Promise<Object>} The local socket address
   * @throws {"invalid-state"} If the socket is not bound
   * @throws {string} Other error codes mapped from system errors
   */
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

  /**
   * Gets the remote address
   * WIT: remote-address: func() -> result<ip-socket-address, error-code>
   *
   * @async
   * @returns {Promise<Object>} The remote socket address
   * @throws {"invalid-state"} If the socket is not connected
   * @throws {string} Other error codes mapped from system errors
   */
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

  /**
   * Checks if the socket is in listening state
   * WIT: is-listening: func() -> bool
   *
   * @returns {boolean} True if socket is listening, false otherwise
   */
  isListening() {
    return this.#state === STATE.LISTENING;
  }

  /**
   * Gets the address family
   * WIT: address-family: func() -> ip-address-family
   *
   * @returns {IP_ADDRESS_FAMILY} The IP address family (IPv4 or IPv6)
   */
  addressFamily() {
    return this.#family;
  }

  /**
   * Sets the listen backlog size
   * WIT: set-listen-backlog-size: func(value: u64) -> result<_, error-code>
   *
   * @async
   * @param {bigint} value - The backlog size
   * @returns {Promise<void>}
   * @throws {"invalid-argument"} If value is 0
   * @throws {"not-supported"} If socket is connecting or connected
   * @throws {"invalid-state"} If socket is not in unbound or bound state
   * @throws {string} Other error codes mapped from system errors
   */
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

  /**
   * Gets whether keep-alive is enabled
   * WIT: keep-alive-enabled: func() -> result<bool, error-code>
   *
   * @async
   * @returns {Promise<boolean>} True if keep-alive is enabled, false otherwise
   * @throws {string} Error codes mapped from system errors
   */
  async keepAliveEnabled() {
    return this.#options.keepAliveEnabled;
  }

  /**
   * Sets keep-alive enabled state
   * WIT: set-keep-alive-enabled: func(value: bool) -> result<_, error-code>
   *
   * @async
   * @param {boolean} value - Whether to enable keep-alive
   * @returns {Promise<void>}
   * @throws {string} Error codes mapped from system errors
   */
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

  /**
   * Gets the keep-alive idle time
   * WIT: keep-alive-idle-time: func() -> result<duration, error-code>
   *
   * @returns {bigint} The keep-alive idle time in nanoseconds
   */
  keepAliveIdleTime() {
    return this.#options.keepAliveIdleTime;
  }

  /**
   * Sets the keep-alive idle time
   * WIT: set-keep-alive-idle-time: func(value: duration) -> result<_, error-code>
   *
   * @async
   * @param {bigint} value - The idle time in nanoseconds
   * @returns {Promise<void>}
   * @throws {"invalid-argument"} If value is less than 1
   * @throws {string} Other error codes mapped from system errors
   */
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

  /**
   * Gets the keep-alive interval
   * WIT: keep-alive-interval: func() -> result<duration, error-code>
   *
   * @returns {bigint} The keep-alive interval in nanoseconds
   */
  keepAliveInterval() {
    return this.#options.keepAliveInterval;
  }

  /**
   * Sets the keep-alive interval
   * WIT: set-keep-alive-interval: func(value: duration) -> result<_, error-code>
   *
   * @param {bigint} value - The interval in nanoseconds
   * @returns {void}
   * @throws {"invalid-argument"} If value is less than 1
   */
  setKeepAliveInterval(value) {
    if (value < 1n) throw "invalid-argument";
    this.#options.keepAliveInterval = value;
  }

  /**
   * Gets the keep-alive count
   * WIT: keep-alive-count: func() -> result<u32, error-code>
   *
   * @returns {number} The keep-alive count
   */
  keepAliveCount() {
    return this.#options.keepAliveCount;
  }

  /**
   * Sets the keep-alive count
   * WIT: set-keep-alive-count: func(value: u32) -> result<_, error-code>
   *
   * @param {number} value - The keep-alive count
   * @returns {void}
   * @throws {"invalid-argument"} If value is less than 1
   */
  setKeepAliveCount(value) {
    if (value < 1) throw "invalid-argument";
    this.#options.keepAliveCount = value;
  }

  /**
   * Gets the hop limit
   * WIT: hop-limit: func() -> result<u8, error-code>
   *
   * @returns {number} The hop limit
   */
  hopLimit() {
    return this.#options.hopLimit;
  }

  /**
   * Sets the hop limit
   * WIT: set-hop-limit: func(value: u8) -> result<_, error-code>
   *
   * @param {number} value - The hop limit
   * @returns {void}
   * @throws {"invalid-argument"} If value is less than 1
   */
  setHopLimit(value) {
    if (value < 1) throw "invalid-argument";
    this.#options.hopLimit = value;
  }

  /**
   * Gets the receive buffer size
   * WIT: receive-buffer-size: func() -> result<u64, error-code>
   *
   * @async
   * @returns {Promise<bigint>} The receive buffer size in bytes
   * @throws {string} Error codes mapped from system errors
   */
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

  /**
   * Sets the receive buffer size
   * WIT: set-receive-buffer-size: func(value: u64) -> result<_, error-code>
   *
   * @param {bigint} value - The receive buffer size in bytes
   * @returns {void}
   * @throws {"invalid-argument"} If value is 0
   */
  setReceiveBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    this.#options.receiveBufferSize = value;
  }

  /**
   * Gets the send buffer size
   * WIT: send-buffer-size: func() -> result<u64, error-code>
   *
   * @async
   * @returns {Promise<bigint>} The send buffer size in bytes
   * @throws {string} Error codes mapped from system errors
   */
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

  /**
   * Sets the send buffer size
   * WIT: set-send-buffer-size: func(value: u64) -> result<_, error-code>
   *
   * @param {bigint} value - The send buffer size in bytes
   * @returns {void}
   * @throws {"invalid-argument"} If value is 0
   */
  setSendBufferSize(value) {
    if (value === 0n) throw "invalid-argument";
    this.#options.sendBufferSize = value;
  }

  /**
   * Disposes the socket
   */
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

  /**
   * Validates if a local address is valid for this socket
   * @param {Object} localAddress - The local address to validate
   * @returns {boolean} True if the address is valid, false otherwise
   * @private
   */
  #isValidLocalAddress(localAddress) {
    return (
      this.#family === localAddress.tag &&
      isUnicastIpAddress(localAddress) &&
      !isIpv4MappedAddress(localAddress)
    );
  }

  /**
   * Validates if a remote address is valid for this socket
   * @param {Object} remoteAddress - The remote address to validate
   * @returns {boolean} True if the address is valid, false otherwise
   * @private
   */
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
  /**
   * Creates a new TCP socket
   * WIT: createTcpSocket: func(address-family: ip-address-family) -> result<tcp-socket, error-code>
   *
   * @async
   * @param {IP_ADDRESS_FAMILY} addressFamily - The IP address family (IPv4 or IPv6)
   * @returns {TcpSocket>} A new TCP socket instance
   * @throws {"invalid-argument"} If the address family is not valid
   * @throws {string} Other error codes mapped from system errors
   */
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
