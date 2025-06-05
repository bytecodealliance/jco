import { ResourceWorker } from '../workers/resource-worker.js';
import { SocketError } from './error.js';
import {
    isWildcardIpAddress,
    isUnicastIpAddress,
    IP_ADDRESS_FAMILY,
} from './address.js';

const _worker = new ResourceWorker(
    new URL('../workers/udp-worker.js', import.meta.url)
);

const STATE = {
    UNBOUND: 'unbound',
    BOUND: 'bound',
    CONNECTED: 'connected',
    CLOSED: 'closed',
};

export class UdpSocket {
    #socketId = null;
    #family = null;
    #state = STATE.UNBOUND;
    #remote = null;
    #options = {
        hopLimit: 1,
        receiveBufferSize: undefined,
        sendBufferSize: undefined,
    };

    /**
     * Creates a new UDP socket
     * WIT:
     * ```
     * constructor(address-family: ip-address-family)
     * ```
     *
     * @static
     * @param {IP_ADDRESS_FAMILY} addressFamily - The IP address family (IPv4 or IPv6)
     * @param {string} socketId - The internal socket identifier
     * @returns {UdpSocket} A new UdpSocket instance
     * @private
     */
    static _create(addressFamily, socketId) {
        const sock = new UdpSocket();
        sock.#family = addressFamily;
        sock.#socketId = socketId;
        return sock;
    }

    /**
     * Bind the socket to the provided IP address and port.
     * WIT:
     * ```
     * bind: func(local-address: ip-socket-address) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {Object} localAddress - The local address to bind to
     * @returns {Promise<void>}
     * @throws {SocketError} with payload.tag 'invalid-state' if the socket is not in ~STATE.UNBOUND~
     * @throws {SocketError} with payload.tag 'invalid-argument' if ~localAddress~ is invalid
     * @throws {SocketError} for other errors, payload.tag maps the system error
     *
     */
    async bind(localAddress) {
        if (this.#state !== STATE.UNBOUND) {
            throw new SocketError('invalid-state');
        }
        if (localAddress.tag !== this.#family) {
            throw new SocketError('invalid-argument');
        }

        try {
            await _worker.run({
                op: 'udp-bind',
                socketId: this.#socketId,
                localAddress,
            });
            this.#state = STATE.BOUND;
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Associate this socket with a specific peer address.
     * WIT:
     * ```
     * connect: func(remote-address: ip-socket-address) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {Object} remoteAddress - The remote address to connect to
     * @returns {Promise<void>}
     * @throws {SocketError} with payload.tag 'invalid-state' if the socket is already connected
     * @throws {SocketError} with payload.tag 'invalid-argument' if ~remoteAddress~ is invalid or wildcard
     * @throws {SocketError} for other errors, payload.tag maps the system error
     */
    async connect(remoteAddress) {
        if (this.#state === STATE.CONNECTED) {
            throw new SocketError('invalid-state');
        }
        if (
            remoteAddress.tag !== this.#family ||
            remoteAddress.val.port === 0 ||
            isWildcardIpAddress(remoteAddress) ||
            !isUnicastIpAddress(remoteAddress)
        ) {
            throw new SocketError('invalid-argument');
        }

        try {
            await _worker.run({
                op: 'udp-connect',
                socketId: this.#socketId,
                remoteAddress,
            });
            this.#remote = remoteAddress;
            this.#state = STATE.CONNECTED;
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Dissociate this socket from its peer address.
     * WIT:
     * ```
     * disconnect: func() -> result<_, error-code>
     * ```
     *
     * @async
     * @returns {Promise<void>}
     * @throws {SocketError} with payload.tag 'invalid-state' if the socket is not connected
     * @throws {SocketError} for other errors, payload.tag maps the system error
     */
    async disconnect() {
        if (this.#state !== STATE.CONNECTED) {
            throw new SocketError('invalid-state');
        }
        try {
            await _worker.run({
                op: 'udp-disconnect',
                socketId: this.#socketId,
            });
            this.#remote = null;
            this.#state = STATE.BOUND;
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Send a message on the socket to a particular peer.
     * WIT:
     * ```
     * send: func(data: list<u8>, remote-address: option<ip-socket-address>) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {Uint8Array} data - The datagram payload
     * @param {?Object} remoteAddress Optional peer address if not connected.
     * @returns {Promise<void>}
     * @throws {SocketError} with payload.tag 'invalid-state' if socket is not bound
     * @throws {SocketError} with payload.tag 'invalid-argument' if ~data~ is not a Uint8Array or address invalid
     * @throws {SocketError} for other errors, payload.tag maps the system error
     */
    async send(data, remoteAddress = null) {
        if (this.#state === STATE.UNBOUND || this.#state === STATE.CLOSED) {
            throw new SocketError('invalid-state');
        }

        if (!(data instanceof Uint8Array)) {
            throw new SocketError('invalid-argument');
        }

        const addr = remoteAddress ?? this.#remote;
        if (!addr || addr.val.port === 0n || addr.tag !== this.#family) {
            throw new SocketError('invalid-argument');
        }

        if (this.#state === STATE.CONNECTED && addr !== this.#remote) {
            throw new SocketError('invalid-argument');
        }

        try {
            await _worker.run(
                {
                    op: 'udp-send',
                    socketId: this.#socketId,
                    data,
                    remoteAddress: addr,
                },
                [data.buffer]
            );
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Receive a message on the socket.
     * WIT:
     * ```
     * receive: func() -> result<tuple<list<u8>, ip-socket-address>, error-code>
     * ```
     *
     * @async
     * @returns {Promise<[Uint8Array, Object]>} Received data and sender address
     * @throws {SocketError} with payload.tag 'invalid-state' if socket has not been bound
     * @throws {SocketError} for other errors, payload.tag maps the system error
     */
    async receive() {
        if (this.#state === STATE.UNBOUND) {
            throw new SocketError('invalid-state');
        }
        try {
            const { data, remoteAddress } = await _worker.run({
                op: 'udp-receive',
                socketId: this.#socketId,
            });
            return { data: new Uint8Array(data), addr: remoteAddress };
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Get the current bound address.
     * WIT:
     * ```
     * local-address: func() -> result<ip-socket-address, error-code>
     * ```
     *
     * @async
     * @returns {Promise<Object>} The local socket address
     * @throws {SocketError} with payload.tag 'invalid-state' if the socket hasn't been bound yet
     * @throws {SocketError} for other errors, payload.tag maps the system error
     */
    async localAddress() {
        if (this.#state === STATE.UNBOUND) {
            throw new SocketError('invalid-state');
        }
        try {
            return await _worker.run({
                op: 'udp-get-local-address',
                socketId: this.#socketId,
            });
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Get the address the socket is currently connected to.
     * WIT:
     * ```
     * remote-address: func() -> result<ip-socket-address, error-code>
     * ```
     *
     * @async
     * @returns {Promise<Object>} The connected peer address
     * @throws {SocketError} with payload.tag 'invalid-state' if the socket is not connected
     */
    async remoteAddress() {
        if (this.#state !== STATE.CONNECTED) {
            throw new SocketError('invalid-state');
        }
        return this.#remote;
    }

    /**
     * Whether this is an IPv4 or IPv6 socket.
     * WIT:
     * ```
     * address-family: func() -> ip-address-family
     * ```
     *
     * @returns {IP_ADDRESS_FAMILY}
     */
    addressFamily() {
        return this.#family;
    }

    /**
     * Get the unicast hop limit (TTL).
     * WIT:
     * ```
     * unicast-hop-limit: func() -> result<u8, error-code>
     * ```
     *
     * @returns {number}
     */
    unicastHopLimit() {
        return this.#options.hopLimit;
    }

    /**
     * Set the unicast hop limit (TTL).
     * WIT:
     * ```
     * set-unicast-hop-limit: func(value: u8) -> result<_, error-code>
     * ```
     *
     * @async
     * @param {number} value - The hop limit (must be ≥1)
     * @returns {Promise<void>}
     * @throws {SocketError} with payload.tag 'invalid-argument' if value < 1
     * @throws {SocketError} for other errors, payload.tag maps the system error
     */
    async setUnicastHopLimit(value) {
        if (value < 1) {
            throw new SocketError('invalid-argument');
        }
        this.#options.hopLimit = value;
        try {
            await _worker.run({
                op: 'udp-set-unicast-hop-limit',
                socketId: this.#socketId,
                value,
            });
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Get the receive buffer size.
     * WIT:
     * ```
     * receive-buffer-size: func() -> result<u64, error-code>
     * ```
     *
     * @async
     * @returns {Promise<bigint>}
     * @throws {SocketError} payload.tag maps the system error
     */
    async receiveBufferSize() {
        if (this.#options.receiveBufferSize) {
            return this.#options.receiveBufferSize;
        }
        try {
            const size = await _worker.run({
                op: 'udp-recv-buffer-size',
                socketId: this.#socketId,
            });
            this.#options.receiveBufferSize = size;
            return size;
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Set the receive buffer size.
     * WIT:
     * ```
     * set-receive-buffer-size: func(value: u64) -> result<_, error-code>
     * ```
     *
     * @param {bigint} value - The buffer size in bytes (must be >0)
     * @throws {SocketError} payload.tag maps the system error
     */
    setReceiveBufferSize(value) {
        if (value === 0n) {
            throw new SocketError('invalid-argument');
        }
        this.#options.receiveBufferSize = value;
    }

    /**
     * Get the send buffer size.
     * WIT:
     * ```
     * send-buffer-size: func() -> result<u64, error-code>
     * ```
     *
     * @async
     * @returns {Promise<bigint>}
     * @throws {SocketError} payload.tag maps the system error
     */
    async sendBufferSize() {
        if (this.#options.sendBufferSize) {
            return this.#options.sendBufferSize;
        }
        try {
            const size = await _worker.run({
                op: 'udp-send-buffer-size',
                socketId: this.#socketId,
            });
            this.#options.sendBufferSize = size;
            return size;
        } catch (e) {
            throw SocketError.from(e);
        }
    }

    /**
     * Set the send buffer size.
     * WIT:
     * ```
     * set-send-buffer-size: func(value: u64) -> result<_, error-code>
     * ```
     *
     * @param {bigint} value - The buffer size in bytes (must be >0)
     * @throws {SocketError} with payload.tag 'invalid-argument' if value == 0
     */
    setSendBufferSize(value) {
        if (value === 0n) {
            throw new SocketError('invalid-argument');
        }
        this.#options.sendBufferSize = value;
    }

    /**
     * Dispose the socket.
     *
     * Releases native resources and marks the socket as closed.
     */
    [Symbol.dispose]() {
        if (this.#socketId) {
            void _worker.run({
                op: 'udp-dispose',
                socketId: this.#socketId,
            });
        }
        this.#socketId = null;
        this.#state = STATE.CLOSED;
    }
}

const udpSocketCreate = UdpSocket._create;
delete UdpSocket._create;

export const udpCreateSocket = {
    /**
     * Create a new UDP socket.
     * WIT:
     * ```
     * createUdpSocket: func(address-family: ip-address-family) -> result<udp-socket, error-code>
     * ```
     *
     * @async
     * @param {IP_ADDRESS_FAMILY} addressFamily - The IP address family
     * @returns {Promise<UdpSocket>}
     * @throws {SocketError} with payload.tag 'invalid-argument' if ~addressFamily~ is not IPv4 or IPv6
     * @throws {SocketError} for other errors, payload.tag maps the system error
     */
    async createUdpSocket(addressFamily) {
        if (
            addressFamily !== IP_ADDRESS_FAMILY.IPV4 &&
            addressFamily !== IP_ADDRESS_FAMILY.IPV6
        ) {
            throw new SocketError('invalid-argument');
        }
        try {
            const { socketId } = await _worker.run({
                op: 'udp-create',
                family: addressFamily,
            });
            return udpSocketCreate(addressFamily, socketId);
        } catch (e) {
            throw SocketError.from(e);
        }
    },
};
