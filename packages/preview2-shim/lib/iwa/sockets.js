export const instanceNetwork = {
    instanceNetwork() {
        console.log(`[sockets] instance network`);
    },
};

export const ipNameLookup = {
    dropResolveAddressStream() {},
    subscribe() {},
    resolveAddresses() {},
    resolveNextAddress() {},
    nonBlocking() {},
    setNonBlocking() {},
};

export const network = {
    dropNetwork() {},
};

// TCP implementation using the Direct Sockets API
export const tcpCreateSocket = {
    /**
     * Create a new TCP socket connected to the given address and port.
     * @param {string} remoteAddress
     * @param {number} remotePort
     * @param {TCPSocketOptions} [options]
     * @returns {TCPSocket}
     */
    createTcpSocket(remoteAddress, remotePort, options = {}) {
        return new TCPSocket(remoteAddress, remotePort, options);
    },
};

export const tcp = {
    /**
     * Wait until the socket connection is established.
     * @param {TCPSocket} socket
     */
    async connect(socket) {
        await socket.opened;
    },
    /**
     * Send data on the TCP socket.
     * @param {TCPSocket} socket
     * @param {Uint8Array} data
     */
    async send(socket, data) {
        const { writable } = await socket.opened;
        const writer = writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
    },
    /**
     * Receive data from the TCP socket.
     * @param {TCPSocket} socket
     * @returns {Promise<Uint8Array | undefined>}
     */
    async receive(socket) {
        const { readable } = await socket.opened;
        const reader = readable.getReader();
        const { value } = await reader.read();
        reader.releaseLock();
        return value;
    },
    /**
     * Close the TCP socket.
     * @param {TCPSocket} socket
     */
    shutdown(socket) {
        socket.close();
    },
    dropTcpSocket(socket) {
        socket.close();
    },
    // The Direct Sockets API does not currently expose these features.
    subscribe() { throw new Error('not supported'); },
    bind() { throw new Error('not supported'); },
    listen() { throw new Error('not supported'); },
    accept() { throw new Error('not supported'); },
    localAddress() { throw new Error('not supported'); },
    remoteAddress() { throw new Error('not supported'); },
    addressFamily() { throw new Error('not supported'); },
    setListenBacklogSize() { throw new Error('not supported'); },
    keepAlive() { throw new Error('not supported'); },
    setKeepAlive() { throw new Error('not supported'); },
    noDelay() { throw new Error('not supported'); },
    setNoDelay() { throw new Error('not supported'); },
    unicastHopLimit() { throw new Error('not supported'); },
    setUnicastHopLimit() { throw new Error('not supported'); },
    receiveBufferSize() { throw new Error('not supported'); },
    setReceiveBufferSize() { throw new Error('not supported'); },
    sendBufferSize() { throw new Error('not supported'); },
    setSendBufferSize() { throw new Error('not supported'); },
    nonBlocking() { throw new Error('not supported'); },
    setNonBlocking() { throw new Error('not supported'); },
};

// UDP implementation using the Direct Sockets API
export const udpCreateSocket = {
    /**
     * Create a new UDP socket.
     * @param {UDPSocketOptions} [options]
     * @returns {UDPSocket}
     */
    createUdpSocket(options = {}) {
        return new UDPSocket(options);
    },
};

export const udp = {
    /**
     * Send data on the UDP socket.
     * @param {UDPSocket} socket
     * @param {Uint8Array} data
     */
    async send(socket, data) {
        const { writable } = await socket.opened;
        const writer = writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
    },
    /**
     * Receive data from the UDP socket.
     * @param {UDPSocket} socket
     * @returns {Promise<Uint8Array | undefined>}
     */
    async receive(socket) {
        const { readable } = await socket.opened;
        const reader = readable.getReader();
        const { value } = await reader.read();
        reader.releaseLock();
        return value;
    },
    dropUdpSocket(socket) {
        socket.close();
    },
    subscribe() { throw new Error('not supported'); },
    bind() { throw new Error('not supported'); },
    connect() { throw new Error('not supported'); },
    localAddress() { throw new Error('not supported'); },
    remoteAddress() { throw new Error('not supported'); },
    addressFamily() { throw new Error('not supported'); },
    unicastHopLimit() { throw new Error('not supported'); },
    setUnicastHopLimit() { throw new Error('not supported'); },
    receiveBufferSize() { throw new Error('not supported'); },
    setReceiveBufferSize() { throw new Error('not supported'); },
    sendBufferSize() { throw new Error('not supported'); },
    setSendBufferSize() { throw new Error('not supported'); },
    nonBlocking() { throw new Error('not supported'); },
    setNonBlocking() { throw new Error('not supported'); },
};
