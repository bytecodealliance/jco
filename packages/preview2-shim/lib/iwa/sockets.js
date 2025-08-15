// IWA Direct Sockets API implementation for preview2-shim
// Uses browser's Direct Sockets API with WASI-compatible interface

import { dnsLookup, dnsResolveAll } from './dns-over-https.js';

const symbolDispose = Symbol.dispose || Symbol.for('dispose');

// Map to track socket metadata not directly exposed by Direct Sockets API
const socketMetadata = new WeakMap();
const activeConnections = new WeakMap();

// network class for capability management
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

// export permission functions
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

// DNS Resolution implementation using DNS-over-HTTPS
class ResolveAddressStream {
    #addresses = [];
    #curItem = 0;
    #resolved = false;
    #error = null;
    #resolvePromise = null;
    
    async #performResolution(name, family) {
        try {
            // use dns-over-https for actual dns resolution
            const results = await dnsResolveAll(name);
            
            // Format addresses based on family preference
            const addresses = [];
            
            if (family === 'ipv6' || !family) {
                for (const addr of results.ipv6) {
                    addresses.push({
                        tag: 'ipv6',
                        val: this.#parseIPv6(addr)
                    });
                }
            }
            
            if (family === 'ipv4' || !family) {
                for (const addr of results.ipv4) {
                    addresses.push({
                        tag: 'ipv4',
                        val: this.#parseIPv4(addr)
                    });
                }
            }
            
            // If no addresses resolved, fall back to hostname
            if (addresses.length === 0) {
                addresses.push({ 
                    type: 'hostname',
                    value: name 
                });
            }
            
            this.#addresses = addresses;
            this.#resolved = true;
        } catch (_err) {
            console.error('DNS resolution failed:', err);
            // Fall back to passing the hostname directly
            this.#addresses = [{ 
                type: 'hostname',
                value: name 
            }];
            this.#resolved = true;
        }
    }
    
    #parseIPv4(addr) {
        // Parse IPv4 address string to tuple format
        const parts = addr.split('.').map(n => parseInt(n, 10));
        return [parts[0], parts[1], parts[2], parts[3]];
    }
    
    #parseIPv6(addr) {
        // Parse IPv6 address string to array format
        // Expand :: notation
        const parts = addr.split(':');
        const result = [];
        
        let skipIndex = -1;
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '') {
                skipIndex = i;
                break;
            }
            result.push(parseInt(parts[i], 16));
        }
        
        if (skipIndex >= 0) {
            // Handle :: expansion
            const remaining = parts.slice(skipIndex + 1).filter(p => p !== '');
            const zeros = 8 - result.length - remaining.length;
            for (let i = 0; i < zeros; i++) {
                result.push(0);
            }
            for (const part of remaining) {
                result.push(parseInt(part, 16));
            }
        }
        
        return result;
    }
    
    resolveNextAddress() {
        if (this.#error) {
            throw this.#error;
        }
        if (this.#curItem < this.#addresses.length) {
            return this.#addresses[this.#curItem++];
        }
        return undefined;
    }
    
    subscribe() {
        // Return a pollable that resolves when DNS is complete
        return {
            ready: () => Promise.resolve(this.#resolved),
            blockUntilReady: () => {
                if (this.#resolved) {return Promise.resolve();}
                return this.#resolvePromise;
            }
        };
    }
    
    static _resolveAddresses(network, name, family) {
        const stream = new ResolveAddressStream();
        stream.#resolvePromise = stream.#performResolution(name, family);
        return stream;
    }
    
    [symbolDispose]() {
        // Cleanup if needed
    }
}

const resolveAddresses = ResolveAddressStream._resolveAddresses;
delete ResolveAddressStream._resolveAddresses;

export const ipNameLookup = {
    ResolveAddressStream,
    resolveAddresses,
};

// TCP Socket implementation
class TcpSocket {
    #family;
    #state = 'unbound'; // unbound, binding, bound, connecting, connected, listening, closed
    #network = null;
    #nativeSocket = null;
    #localAddress = null;
    #remoteAddress = null;
    #streams = null;
    #serverSocket = null;
    #options = {
        keepAlive: false,
        keepAliveIdleTime: 7200_000_000_000n, // 2 hours in nanoseconds
        keepAliveInterval: 1_000_000_000n,
        keepAliveCount: 10,
        hopLimit: 64,
        sendBufferSize: 65536n,
        receiveBufferSize: 65536n,
        noDelay: true
    };
    
    static _create(addressFamily) {
        const socket = new TcpSocket();
        socket.#family = addressFamily;
        return socket;
    }
    
    startBind(network, localAddress) {
        if (this.#state !== 'unbound') {
            throw 'invalid-state';
        }
        
        this.#network = network;
        this.#localAddress = localAddress;
        this.#state = 'binding';
        
        // For server sockets, we'll create TCPServerSocket during listen
        // For client sockets, we'll bind during connect
    }
    
    finishBind() {
        if (this.#state !== 'binding') {
            throw 'not-in-progress';
        }
        this.#state = 'bound';
    }
    
    async startConnect(network, remoteAddress) {
        if (this.#network && network !== this.#network) {
            throw 'invalid-argument';
        }
        if (this.#state === 'connected' || this.#state === 'connecting') {
            throw 'invalid-state';
        }
        if (this.#state === 'listening') {
            throw 'invalid-state';
        }
        
        this.#network = network;
        this.#remoteAddress = remoteAddress;
        this.#state = 'connecting';
        
        // Create TCPSocket with Direct Sockets API
        const options = {
            noDelay: this.#options.noDelay,
            keepAliveDelay: Number(this.#options.keepAliveIdleTime / 1_000_000n), // Convert ns to ms
            sendBufferSize: Number(this.#options.sendBufferSize),
            receiveBufferSize: Number(this.#options.receiveBufferSize),
            dnsQueryType: this.#family === 'ipv6' ? 'ipv6' : 'ipv4'
        };
        
        try {
            let address = remoteAddress.address || remoteAddress;
            const port = remoteAddress.port || 0;
            
            // Check if address is a hostname that needs resolution
            // IPv4 pattern: x.x.x.x where x is 0-255
            // IPv6 pattern: contains colons
            const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(address);
            const isIPv6 = address.includes(':');
            
            if (!isIPv4 && !isIPv6) {
                // It's a hostname, try to resolve it first
                try {
                    const resolved = await dnsLookup(address, this.#family === 'ipv6' ? 'aaaa' : 'a', 1);
                    if (resolved && resolved.length > 0) {
                        address = resolved[0]; // Use first resolved address
                        console.log(`Resolved ${remoteAddress.address} to ${address}`);
                    }
                } catch (dnsErr) {
                    console.warn(`DNS resolution failed, using hostname directly: ${dnsErr.message}`);
                    // Fall back to letting Direct Sockets API handle it
                }
            }
            
            this.#nativeSocket = new TCPSocket(address, port, options);
            
            // Store connection promise for finishConnect
            activeConnections.set(this, this.#nativeSocket.opened);
        } catch (_err) {
            this.#state = 'closed';
            throw 'connection-refused';
        }
    }
    
    async finishConnect() {
        if (this.#state !== 'connecting') {
            throw 'not-in-progress';
        }
        
        try {
            const connection = await activeConnections.get(this);
            activeConnections.delete(this);
            
            this.#state = 'connected';
            
            // Create stream wrappers
            const inputStream = {
                _readable: connection.readable,
                read: async (len) => {
                    const reader = connection.readable.getReader();
                    try {
                        const { value, done } = await reader.read();
                        return done ? [] : [value];
                    } finally {
                        reader.releaseLock();
                    }
                },
                blockingRead: async (len) => {
                    const reader = connection.readable.getReader();
                    try {
                        const { value, done } = await reader.read();
                        return done ? [] : [value];
                    } finally {
                        reader.releaseLock();
                    }
                },
                subscribe: () => ({
                    ready: () => Promise.resolve(true),
                    blockUntilReady: () => Promise.resolve()
                })
            };
            
            const outputStream = {
                _writable: connection.writable,
                write: async (data) => {
                    const writer = connection.writable.getWriter();
                    try {
                        await writer.write(data);
                        return data.length;
                    } finally {
                        writer.releaseLock();
                    }
                },
                blockingWriteAndFlush: async (data) => {
                    const writer = connection.writable.getWriter();
                    try {
                        await writer.write(data);
                        return data.length;
                    } finally {
                        writer.releaseLock();
                    }
                },
                subscribe: () => ({
                    ready: () => Promise.resolve(true),
                    blockUntilReady: () => Promise.resolve()
                })
            };
            
            this.#streams = [inputStream, outputStream];
            return this.#streams;
        } catch (_err) {
            this.#state = 'closed';
            throw 'connection-refused';
        }
    }
    
    startListen() {
        if (this.#state !== 'bound' && this.#state !== 'unbound') {
            throw 'invalid-state';
        }
        
        this.#state = 'listening';
        
        // Create TCPServerSocket
        const address = this.#localAddress?.address || '0.0.0.0';
        const port = this.#localAddress?.port || 0;
        
        const options = {
            localPort: port,
            backlog: 128,
            ipv6Only: this.#family === 'ipv6'
        };
        
        try {
            this.#serverSocket = new TCPServerSocket(address, options);
        } catch (_err) {
            this.#state = 'closed';
            throw 'address-in-use';
        }
    }
    
    finishListen() {
        if (this.#state !== 'listening') {
            throw 'not-in-progress';
        }
        // Server socket is ready
    }
    
    async accept() {
        if (this.#state !== 'listening') {
            throw 'invalid-state';
        }
        
        const connection = await this.#serverSocket.opened;
        const reader = connection.readable.getReader();
        
        try {
            const { value: clientSocket } = await reader.read();
            reader.releaseLock();
            
            if (clientSocket) {
                // Create a new TcpSocket instance for the accepted connection
                const socket = TcpSocket._create(this.#family);
                socket.#state = 'connected';
                socket.#nativeSocket = clientSocket;
                socket.#network = this.#network;
                
                const clientConnection = await clientSocket.opened;
                
                // Create streams for the accepted socket
                const inputStream = {
                    _readable: clientConnection.readable,
                    read: async (len) => {
                        const r = clientConnection.readable.getReader();
                        try {
                            const { value, done } = await r.read();
                            return done ? [] : [value];
                        } finally {
                            r.releaseLock();
                        }
                    },
                    blockingRead: async (len) => {
                        const r = clientConnection.readable.getReader();
                        try {
                            const { value, done } = await r.read();
                            return done ? [] : [value];
                        } finally {
                            r.releaseLock();
                        }
                    },
                    subscribe: () => ({
                        ready: () => Promise.resolve(true),
                        blockUntilReady: () => Promise.resolve()
                    })
                };
                
                const outputStream = {
                    _writable: clientConnection.writable,
                    write: async (data) => {
                        const w = clientConnection.writable.getWriter();
                        try {
                            await w.write(data);
                            return data.length;
                        } finally {
                            w.releaseLock();
                        }
                    },
                    blockingWriteAndFlush: async (data) => {
                        const w = clientConnection.writable.getWriter();
                        try {
                            await w.write(data);
                            return data.length;
                        } finally {
                            w.releaseLock();
                        }
                    },
                    subscribe: () => ({
                        ready: () => Promise.resolve(true),
                        blockUntilReady: () => Promise.resolve()
                    })
                };
                
                return [socket, inputStream, outputStream];
            }
        } catch (_err) {
            throw 'connection-aborted';
        }
    }
    
    localAddress() {
        return this.#localAddress;
    }
    
    remoteAddress() {
        return this.#remoteAddress;
    }
    
    isListening() {
        return this.#state === 'listening';
    }
    
    addressFamily() {
        return this.#family;
    }
    
    setListenBacklogSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        // Note: Cannot change after server socket creation
        console.warn('setListenBacklogSize: Cannot modify after socket creation');
    }
    
    keepAliveEnabled() {
        return this.#options.keepAlive;
    }
    
    setKeepAliveEnabled(value) {
        this.#options.keepAlive = value;
        // Note: Cannot change on existing socket
        if (this.#nativeSocket) {
            console.warn('setKeepAliveEnabled: Cannot modify after socket creation');
        }
    }
    
    keepAliveIdleTime() {
        return this.#options.keepAliveIdleTime;
    }
    
    setKeepAliveIdleTime(value) {
        if (value < 1n) {
            throw 'invalid-argument';
        }
        this.#options.keepAliveIdleTime = value;
        if (this.#nativeSocket) {
            console.warn('setKeepAliveIdleTime: Cannot modify after socket creation');
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
        return this.#options.receiveBufferSize;
    }
    
    setReceiveBufferSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        this.#options.receiveBufferSize = value;
        if (this.#nativeSocket) {
            console.warn('setReceiveBufferSize: Cannot modify after socket creation');
        }
    }
    
    sendBufferSize() {
        return this.#options.sendBufferSize;
    }
    
    setSendBufferSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        this.#options.sendBufferSize = value;
        if (this.#nativeSocket) {
            console.warn('setSendBufferSize: Cannot modify after socket creation');
        }
    }
    
    subscribe() {
        return {
            ready: () => {
                if (this.#state === 'connecting' && this.#nativeSocket) {
                    return this.#nativeSocket.opened.then(() => true).catch(() => false);
                }
                return Promise.resolve(true);
            },
            blockUntilReady: () => Promise.resolve()
        };
    }
    
    shutdown(shutdownType) {
        if (this.#nativeSocket) {
            this.#nativeSocket.close();
        }
        if (this.#serverSocket) {
            this.#serverSocket.close();
        }
        this.#state = 'closed';
    }
    
    [symbolDispose]() {
        this.shutdown('both');
    }
}

const tcpSocketCreate = TcpSocket._create;
delete TcpSocket._create;

export const tcpCreateSocket = {
    createTcpSocket(addressFamily) {
        if (addressFamily !== 'ipv4' && addressFamily !== 'ipv6') {
            throw 'not-supported';
        }
        return tcpSocketCreate(addressFamily);
    },
};

export const tcp = {
    TcpSocket,
};

// UDP Socket implementation
class IncomingDatagramStream {
    #readable;
    #buffer = [];
    
    static _create(readable) {
        const stream = new IncomingDatagramStream();
        stream.#readable = readable;
        return stream;
    }
    
    async receive(maxResults) {
        const results = [];
        const reader = this.#readable.getReader();
        
        try {
            while (results.length < maxResults) {
                const { value, done } = await reader.read();
                if (done) {break;}
                
                results.push({
                    data: value.data || value,
                    remoteAddress: {
                        address: value.remoteAddress || '0.0.0.0',
                        port: value.remotePort || 0
                    }
                });
                
                if (results.length >= maxResults) {break;}
            }
        } finally {
            reader.releaseLock();
        }
        
        return results;
    }
    
    subscribe() {
        return {
            ready: () => Promise.resolve(true),
            blockUntilReady: () => Promise.resolve()
        };
    }
    
    [symbolDispose]() {
        // Cleanup
    }
}

const incomingDatagramStreamCreate = IncomingDatagramStream._create;
delete IncomingDatagramStream._create;

class OutgoingDatagramStream {
    #writable;
    
    static _create(writable) {
        const stream = new OutgoingDatagramStream();
        stream.#writable = writable;
        return stream;
    }
    
    checkSend() {
        // Return number of datagrams that can be sent
        return 64n; // Default batch size
    }
    
    async send(datagrams) {
        const writer = this.#writable.getWriter();
        let sent = 0n;
        
        try {
            for (const datagram of datagrams) {
                await writer.write({
                    data: datagram.data,
                    remoteAddress: datagram.remoteAddress?.address,
                    remotePort: datagram.remoteAddress?.port
                });
                sent++;
            }
        } finally {
            writer.releaseLock();
        }
        
        return sent;
    }
    
    subscribe() {
        return {
            ready: () => Promise.resolve(true),
            blockUntilReady: () => Promise.resolve()
        };
    }
    
    [symbolDispose]() {
        // Cleanup
    }
}

const outgoingDatagramStreamCreate = OutgoingDatagramStream._create;
delete OutgoingDatagramStream._create;

class UdpSocket {
    #family;
    #state = 'unbound';
    #network = null;
    #nativeSocket = null;
    #localAddress = null;
    #remoteAddress = null;
    #unicastHopLimit = 64;
    #options = {
        sendBufferSize: 65536n,
        receiveBufferSize: 65536n
    };
    
    static _create(addressFamily) {
        if (addressFamily !== 'ipv4' && addressFamily !== 'ipv6') {
            throw 'not-supported';
        }
        const socket = new UdpSocket();
        socket.#family = addressFamily;
        return socket;
    }
    
    startBind(network, localAddress) {
        if (this.#state !== 'unbound') {
            throw 'invalid-state';
        }
        
        this.#network = network;
        this.#localAddress = localAddress;
        this.#state = 'binding';
        
        // Create UDP socket
        const options = {
            localAddress: localAddress.address || '0.0.0.0',
            localPort: localAddress.port || 0,
            sendBufferSize: Number(this.#options.sendBufferSize),
            receiveBufferSize: Number(this.#options.receiveBufferSize),
            ipv6Only: this.#family === 'ipv6'
        };
        
        try {
            this.#nativeSocket = new UDPSocket(options);
        } catch (_err) {
            this.#state = 'unbound';
            throw 'address-in-use';
        }
    }
    
    async finishBind() {
        if (this.#state !== 'binding') {
            throw 'not-in-progress';
        }
        
        await this.#nativeSocket.opened;
        this.#state = 'bound';
    }
    
    async stream(remoteAddress) {
        if (this.#state !== 'bound') {
            throw 'invalid-state';
        }
        
        this.#remoteAddress = remoteAddress;
        
        const connection = await this.#nativeSocket.opened;
        
        // Create datagram streams
        const incomingStream = incomingDatagramStreamCreate(connection.readable);
        const outgoingStream = outgoingDatagramStreamCreate(connection.writable);
        
        return [incomingStream, outgoingStream];
    }
    
    localAddress() {
        return this.#localAddress;
    }
    
    remoteAddress() {
        return this.#remoteAddress;
    }
    
    addressFamily() {
        return this.#family;
    }
    
    unicastHopLimit() {
        return this.#unicastHopLimit;
    }
    
    setUnicastHopLimit(value) {
        if (value < 1) {
            throw 'invalid-argument';
        }
        this.#unicastHopLimit = value;
        // Note: Not supported by Direct Sockets API
        console.warn('setUnicastHopLimit: Not supported by Direct Sockets API');
    }
    
    receiveBufferSize() {
        return this.#options.receiveBufferSize;
    }
    
    setReceiveBufferSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        this.#options.receiveBufferSize = value;
        if (this.#nativeSocket) {
            console.warn('setReceiveBufferSize: Cannot modify after socket creation');
        }
    }
    
    sendBufferSize() {
        return this.#options.sendBufferSize;
    }
    
    setSendBufferSize(value) {
        if (value === 0n) {
            throw 'invalid-argument';
        }
        this.#options.sendBufferSize = value;
        if (this.#nativeSocket) {
            console.warn('setSendBufferSize: Cannot modify after socket creation');
        }
    }
    
    subscribe() {
        return {
            ready: () => {
                if (this.#state === 'binding' && this.#nativeSocket) {
                    return this.#nativeSocket.opened.then(() => true).catch(() => false);
                }
                return Promise.resolve(true);
            },
            blockUntilReady: () => Promise.resolve()
        };
    }
    
    [symbolDispose]() {
        if (this.#nativeSocket) {
            this.#nativeSocket.close();
        }
    }
}

const createUdpSocket = UdpSocket._create;
delete UdpSocket._create;

export const udpCreateSocket = {
    createUdpSocket,
};

export const udp = {
    UdpSocket,
    IncomingDatagramStream,
    OutgoingDatagramStream,
};