import type {
    instanceNetwork as InstanceNetworkNamespace,
    ipNameLookup as IpNameLookupNamespace,
    network as NetworkNamespace,
    tcpCreateSocket as TcpCreateSocketNamespace,
    tcp as TcpNamespace,
    udpCreateSocket as UdpCreateSocketNamespace,
    udp as UdpNamespace,
} from "../../types/sockets.js";

const unsupported = (): never => {
    throw "not-supported";
};

class Network implements NetworkNamespace.Network {}
const defaultNetwork = new Network();

export const instanceNetwork: typeof InstanceNetworkNamespace = {
    instanceNetwork: () => defaultNetwork,
};

export const network: typeof NetworkNamespace = { Network };

class ResolveAddressStream implements IpNameLookupNamespace.ResolveAddressStream {
    resolveNextAddress = unsupported;
    subscribe = unsupported;
}

export const ipNameLookup: typeof IpNameLookupNamespace = {
    ResolveAddressStream,
    resolveAddresses: unsupported,
};

class TcpSocket implements TcpNamespace.TcpSocket {
    startBind = unsupported;
    finishBind = unsupported;
    startConnect = unsupported;
    finishConnect = unsupported;
    startListen = unsupported;
    finishListen = unsupported;
    accept = unsupported;
    localAddress = unsupported;
    remoteAddress = unsupported;
    isListening = unsupported;
    addressFamily = unsupported;
    setListenBacklogSize = unsupported;
    keepAliveEnabled = unsupported;
    setKeepAliveEnabled = unsupported;
    keepAliveIdleTime = unsupported;
    setKeepAliveIdleTime = unsupported;
    keepAliveInterval = unsupported;
    setKeepAliveInterval = unsupported;
    keepAliveCount = unsupported;
    setKeepAliveCount = unsupported;
    hopLimit = unsupported;
    setHopLimit = unsupported;
    receiveBufferSize = unsupported;
    setReceiveBufferSize = unsupported;
    sendBufferSize = unsupported;
    setSendBufferSize = unsupported;
    subscribe = unsupported;
    shutdown = unsupported;
}

export const tcpCreateSocket: typeof TcpCreateSocketNamespace = {
    createTcpSocket: unsupported,
};

export const tcp: typeof TcpNamespace = { TcpSocket };

class IncomingDatagramStream implements UdpNamespace.IncomingDatagramStream {
    receive = unsupported;
    subscribe = unsupported;
}

class OutgoingDatagramStream implements UdpNamespace.OutgoingDatagramStream {
    checkSend = unsupported;
    send = unsupported;
    subscribe = unsupported;
}

class UdpSocket implements UdpNamespace.UdpSocket {
    startBind = unsupported;
    finishBind = unsupported;
    stream = unsupported;
    localAddress = unsupported;
    remoteAddress = unsupported;
    addressFamily = unsupported;
    unicastHopLimit = unsupported;
    setUnicastHopLimit = unsupported;
    receiveBufferSize = unsupported;
    setReceiveBufferSize = unsupported;
    sendBufferSize = unsupported;
    setSendBufferSize = unsupported;
    subscribe = unsupported;
}

export const udpCreateSocket: typeof UdpCreateSocketNamespace = {
    createUdpSocket: unsupported,
};

export const udp: typeof UdpNamespace = {
    IncomingDatagramStream,
    OutgoingDatagramStream,
    UdpSocket,
};
