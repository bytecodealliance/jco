import {
    SOCKET_DATAGRAM_STREAM_DISPOSE,
    SOCKET_DATAGRAM_STREAM_SUBSCRIBE,
    SOCKET_INCOMING_DATAGRAM_STREAM_RECEIVE,
    SOCKET_OUTGOING_DATAGRAM_STREAM_CHECK_SEND,
    SOCKET_OUTGOING_DATAGRAM_STREAM_SEND,
    SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST,
    SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST,
    SOCKET_RESOLVE_ADDRESS_SUBSCRIBE_REQUEST,
    SOCKET_RESOLVE_ADDRESS_TAKE_REQUEST,
    SOCKET_GET_DEFAULT_RECEIVE_BUFFER_SIZE,
    SOCKET_GET_DEFAULT_SEND_BUFFER_SIZE,
    SOCKET_TCP_ACCEPT,
    SOCKET_TCP_BIND_FINISH,
    SOCKET_TCP_BIND_START,
    SOCKET_TCP_CONNECT_FINISH,
    SOCKET_TCP_CONNECT_START,
    SOCKET_TCP_CREATE_HANDLE,
    SOCKET_TCP_DISPOSE,
    SOCKET_TCP_GET_LOCAL_ADDRESS,
    SOCKET_TCP_GET_REMOTE_ADDRESS,
    SOCKET_TCP_IS_LISTENING,
    SOCKET_TCP_LISTEN_FINISH,
    SOCKET_TCP_LISTEN_START,
    SOCKET_TCP_SET_KEEP_ALIVE,
    SOCKET_TCP_SET_LISTEN_BACKLOG_SIZE,
    SOCKET_TCP_SHUTDOWN,
    SOCKET_TCP_SUBSCRIBE,
    SOCKET_TCP,
    SOCKET_UDP_BIND_FINISH,
    SOCKET_UDP_BIND_START,
    SOCKET_UDP_CREATE_HANDLE,
    SOCKET_UDP_DISPOSE,
    SOCKET_UDP_GET_LOCAL_ADDRESS,
    SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE,
    SOCKET_UDP_GET_REMOTE_ADDRESS,
    SOCKET_UDP_GET_SEND_BUFFER_SIZE,
    SOCKET_UDP_GET_UNICAST_HOP_LIMIT,
    SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE,
    SOCKET_UDP_SET_SEND_BUFFER_SIZE,
    SOCKET_UDP_SET_UNICAST_HOP_LIMIT,
    SOCKET_UDP_STREAM,
    SOCKET_UDP_SUBSCRIBE,
} from '../io/calls.js';
import {
    earlyDispose,
    inputStreamCreate,
    ioCall,
    outputStreamCreate,
    pollableCreate,
    registerDispose,
} from '../io/worker-io.js';

const symbolDispose = Symbol.dispose || Symbol.for('dispose');

/**
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 */

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
    #id;
    #data;
    #curItem = 0;
    #error = false;
    #finalizer;
    resolveNextAddress() {
        if (!this.#data) {
            const res = ioCall(
                SOCKET_RESOLVE_ADDRESS_TAKE_REQUEST,
                this.#id,
                null
            );
            this.#data = res.val;
            this.#error = res.tag === 'err';
        }
        if (this.#error) {
            throw this.#data;
        }
        if (this.#curItem < this.#data.length) {
            return this.#data[this.#curItem++];
        }
        return undefined;
    }
    subscribe() {
        return pollableCreate(
            ioCall(SOCKET_RESOLVE_ADDRESS_SUBSCRIBE_REQUEST, this.#id, null),
            this
        );
    }
    static _resolveAddresses(network, name) {
        if (!mayDnsLookup(network)) {
            throw 'permanent-resolver-failure';
        }
        const res = new ResolveAddressStream();
        res.#id = ioCall(SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST, null, name);
        res.#finalizer = registerDispose(
            res,
            null,
            res.#id,
            resolveAddressStreamDispose
        );
        return res;
    }
    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}
function resolveAddressStreamDispose(id) {
    ioCall(SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST, id, null);
}

const resolveAddresses = ResolveAddressStream._resolveAddresses;
delete ResolveAddressStream._resolveAddresses;

export const ipNameLookup = {
    ResolveAddressStream,
    resolveAddresses,
};

class TcpSocket {
    #id;
    #network;
    #family;
    #finalizer;
    #options = {
        // defaults per https://nodejs.org/docs/latest/api/net.html#socketsetkeepaliveenable-initialdelay
        keepAlive: false,
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
        sendBufferSize: undefined,
        receiveBufferSize: undefined,
    };
    /**
     * @param {IpAddressFamily} addressFamily
     * @param {number} id
     * @returns {TcpSocket}
     */
    static _create(addressFamily, id) {
        const socket = new TcpSocket();
        socket.#id = id;
        socket.#family = addressFamily;
        socket.#finalizer = registerDispose(socket, null, id, socketTcpDispose);
        return socket;
    }
    startBind(network, localAddress) {
        if (!mayTcp(network)) {
            throw 'access-denied';
        }
        ioCall(SOCKET_TCP_BIND_START, this.#id, {
            localAddress,
            family: this.#family,
        });
        this.#network = network;
    }
    finishBind() {
        ioCall(SOCKET_TCP_BIND_FINISH, this.#id, null);
    }
    startConnect(network, remoteAddress) {
        if (this.#network && network !== this.#network) {
            throw 'invalid-argument';
        }
        if (!mayTcp(network)) {
            throw 'access-denied';
        }
        ioCall(SOCKET_TCP_CONNECT_START, this.#id, {
            remoteAddress,
            family: this.#family,
        });
        this.#network = network;
    }
    finishConnect() {
        const [inputStreamId, outputStreamId] = ioCall(
            SOCKET_TCP_CONNECT_FINISH,
            this.#id,
            null
        );
        return [
            inputStreamCreate(SOCKET_TCP, inputStreamId),
            outputStreamCreate(SOCKET_TCP, outputStreamId),
        ];
    }
    startListen() {
        if (!mayTcp(this.#network)) {
            throw 'access-denied';
        }
        ioCall(SOCKET_TCP_LISTEN_START, this.#id, null);
    }
    finishListen() {
        ioCall(SOCKET_TCP_LISTEN_FINISH, this.#id, null);
    }
    accept() {
        if (!mayTcp(this.#network)) {
            throw 'access-denied';
        }
        const [socketId, inputStreamId, outputStreamId] = ioCall(
            SOCKET_TCP_ACCEPT,
            this.#id,
            null
        );
        const socket = tcpSocketCreate(this.#family, socketId);
        Object.assign(socket.#options, this.#options);
        return [
            socket,
            inputStreamCreate(SOCKET_TCP, inputStreamId),
            outputStreamCreate(SOCKET_TCP, outputStreamId),
        ];
    }
    localAddress() {
        return ioCall(SOCKET_TCP_GET_LOCAL_ADDRESS, this.#id, null);
    }
    remoteAddress() {
        return ioCall(SOCKET_TCP_GET_REMOTE_ADDRESS, this.#id, null);
    }
    isListening() {
        return ioCall(SOCKET_TCP_IS_LISTENING, this.#id, null);
    }
    addressFamily() {
        return this.#family;
    }
    setListenBacklogSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        ioCall(SOCKET_TCP_SET_LISTEN_BACKLOG_SIZE, this.#id, value);
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
        if (value < 1n) {
            throw 'invalid-argument';
        }
        if (value < 1_000_000_000n) {
            value = 1_000_000_000n;
        }
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
        if (value < 1n) {
            throw 'invalid-argument';
        }
        this.#options.keepAliveInterval = value;
    }
    keepAliveCount() {
        return this.#options.keepAliveCount;
    }
    setKeepAliveCount(value) {
        if (value < 1) {
            throw 'invalid-argument';
        }
        this.#options.keepAliveCount = value;
    }
    hopLimit() {
        return this.#options.hopLimit;
    }
    setHopLimit(value) {
        if (value < 1) {
            throw 'invalid-argument';
        }
        this.#options.hopLimit = value;
    }
    receiveBufferSize() {
        if (!this.#options.receiveBufferSize) {
            this.#options.receiveBufferSize = ioCall(
                SOCKET_GET_DEFAULT_RECEIVE_BUFFER_SIZE,
                null,
                null
            );
        }
        return this.#options.receiveBufferSize;
    }
    setReceiveBufferSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        this.#options.receiveBufferSize = value;
    }
    sendBufferSize() {
        if (!this.#options.sendBufferSize) {
            this.#options.sendBufferSize = ioCall(
                SOCKET_GET_DEFAULT_SEND_BUFFER_SIZE,
                null,
                null
            );
        }
        return this.#options.sendBufferSize;
    }
    setSendBufferSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        this.#options.sendBufferSize = value;
    }
    subscribe() {
        return pollableCreate(
            ioCall(SOCKET_TCP_SUBSCRIBE, this.#id, null),
            this
        );
    }
    shutdown(shutdownType) {
        ioCall(SOCKET_TCP_SHUTDOWN, this.#id, shutdownType);
    }
    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}

function socketTcpDispose(id) {
    ioCall(SOCKET_TCP_DISPOSE, id, null);
}

const tcpSocketCreate = TcpSocket._create;
delete TcpSocket._create;

export const tcpCreateSocket = {
    createTcpSocket(addressFamily) {
        if (addressFamily !== 'ipv4' && addressFamily !== 'ipv6') {
            throw 'not-supported';
        }
        return tcpSocketCreate(
            addressFamily,
            ioCall(SOCKET_TCP_CREATE_HANDLE, null, null)
        );
    },
};

export const tcp = {
    TcpSocket,
};

class UdpSocket {
    #id;
    #network;
    #family;
    #finalizer;
    static _create(addressFamily) {
        if (addressFamily !== 'ipv4' && addressFamily !== 'ipv6') {
            throw 'not-supported';
        }
        const socket = new UdpSocket();
        socket.#id = ioCall(SOCKET_UDP_CREATE_HANDLE, null, {
            family: addressFamily,
            // we always set the unicastHopLimit, because there is no
            // getter but only a setter for this in Node.js, so it is the
            // only way to guarantee the consistent value
            unicastHopLimit: 64,
        });
        socket.#family = addressFamily;
        socket.#finalizer = registerDispose(
            socket,
            null,
            socket.#id,
            socketUdpDispose
        );
        return socket;
    }
    startBind(network, localAddress) {
        if (!mayUdp(network)) {
            throw 'access-denied';
        }
        ioCall(SOCKET_UDP_BIND_START, this.#id, {
            localAddress,
            family: this.#family,
        });
        this.#network = network;
    }
    finishBind() {
        ioCall(SOCKET_UDP_BIND_FINISH, this.#id, null);
    }
    stream(remoteAddress) {
        if (!mayUdp(this.#network)) {
            throw 'access-denied';
        }
        const [incomingDatagramStreamId, outgoingDatagramStreamId] = ioCall(
            SOCKET_UDP_STREAM,
            this.#id,
            remoteAddress
        );
        return [
            incomingDatagramStreamCreate(incomingDatagramStreamId),
            outgoingDatagramStreamCreate(outgoingDatagramStreamId),
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
    unicastHopLimit() {
        return ioCall(SOCKET_UDP_GET_UNICAST_HOP_LIMIT, this.#id);
    }
    setUnicastHopLimit(value) {
        if (value < 1) {
            throw 'invalid-argument';
        }
        ioCall(SOCKET_UDP_SET_UNICAST_HOP_LIMIT, this.#id, value);
    }
    receiveBufferSize() {
        return ioCall(SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE, this.#id);
    }
    setReceiveBufferSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        ioCall(SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE, this.#id, value);
    }
    sendBufferSize() {
        return ioCall(SOCKET_UDP_GET_SEND_BUFFER_SIZE, this.#id);
    }
    setSendBufferSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        ioCall(SOCKET_UDP_SET_SEND_BUFFER_SIZE, this.#id, value);
    }
    subscribe() {
        return pollableCreate(
            ioCall(SOCKET_UDP_SUBSCRIBE, this.#id, null),
            this
        );
    }
    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}

function socketUdpDispose(id) {
    ioCall(SOCKET_UDP_DISPOSE, id, null);
}

const createUdpSocket = UdpSocket._create;
delete UdpSocket._create;

class IncomingDatagramStream {
    #id;
    #finalizer;
    static _create(id) {
        const stream = new IncomingDatagramStream();
        stream.#id = id;
        stream.#finalizer = registerDispose(
            stream,
            null,
            id,
            incomingDatagramStreamDispose
        );
        return stream;
    }
    receive(maxResults) {
        return ioCall(
            SOCKET_INCOMING_DATAGRAM_STREAM_RECEIVE,
            this.#id,
            maxResults
        );
    }
    subscribe() {
        return pollableCreate(
            ioCall(SOCKET_DATAGRAM_STREAM_SUBSCRIBE, this.#id, null),
            this
        );
    }
    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}

function incomingDatagramStreamDispose(id) {
    ioCall(SOCKET_DATAGRAM_STREAM_DISPOSE, id, null);
}

const incomingDatagramStreamCreate = IncomingDatagramStream._create;
delete IncomingDatagramStream._create;

class OutgoingDatagramStream {
    #id = 0;
    #finalizer;
    static _create(id) {
        const stream = new OutgoingDatagramStream();
        stream.#id = id;
        stream.#finalizer = registerDispose(
            stream,
            null,
            id,
            outgoingDatagramStreamDispose
        );
        return stream;
    }
    checkSend() {
        return ioCall(
            SOCKET_OUTGOING_DATAGRAM_STREAM_CHECK_SEND,
            this.#id,
            null
        );
    }
    send(datagrams) {
        return ioCall(
            SOCKET_OUTGOING_DATAGRAM_STREAM_SEND,
            this.#id,
            datagrams
        );
    }
    subscribe() {
        return pollableCreate(
            ioCall(SOCKET_DATAGRAM_STREAM_SUBSCRIBE, this.#id, null),
            this
        );
    }
    [symbolDispose]() {
        if (this.#finalizer) {
            earlyDispose(this.#finalizer);
            this.#finalizer = null;
        }
    }
}
function outgoingDatagramStreamDispose(id) {
    ioCall(SOCKET_DATAGRAM_STREAM_DISPOSE, id, null);
}

const outgoingDatagramStreamCreate = OutgoingDatagramStream._create;
delete OutgoingDatagramStream._create;

export const udpCreateSocket = {
    createUdpSocket,
};

export const udp = {
    UdpSocket,
    OutgoingDatagramStream,
    IncomingDatagramStream,
};
