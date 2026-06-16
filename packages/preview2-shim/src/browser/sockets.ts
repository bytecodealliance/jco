// @ts-nocheck
import type {
  instanceNetwork as InstanceNetworkNamespace,
  ipNameLookup as IpNameLookupNamespace,
  network as NetworkNamespace,
  tcpCreateSocket as TcpCreateSocketNamespace,
  tcp as TcpNamespace,
  udpCreateSocket as UdpCreateSocketNamespace,
  udp as UdpNamespace,
} from "../../types/sockets.js";

export const instanceNetwork: typeof InstanceNetworkNamespace = {
  instanceNetwork() {
    console.log(`[sockets] instance network`);
  },
};

export const ipNameLookup: typeof IpNameLookupNamespace = {
  dropResolveAddressStream() {},
  subscribe() {},
  resolveAddresses() {},
  resolveNextAddress() {},
  nonBlocking() {},
  setNonBlocking() {},
};

export const network: typeof NetworkNamespace = {
  dropNetwork() {},
};

export const tcpCreateSocket: typeof TcpCreateSocketNamespace = {
  createTcpSocket() {},
};

export const tcp: typeof TcpNamespace = {
  subscribe() {},
  dropTcpSocket() {},
  bind() {},
  connect() {},
  listen() {},
  accept() {},
  localAddress() {},
  remoteAddress() {},
  addressFamily() {},
  setListenBacklogSize() {},
  keepAlive() {},
  setKeepAlive() {},
  noDelay() {},
  setNoDelay() {},
  unicastHopLimit() {},
  setUnicastHopLimit() {},
  receiveBufferSize() {},
  setReceiveBufferSize() {},
  sendBufferSize() {},
  setSendBufferSize() {},
  nonBlocking() {},
  setNonBlocking() {},
  shutdown() {},
};

export const udpCreateSocket: typeof UdpCreateSocketNamespace = {
  createUdpSocket() {},
};

export const udp: typeof UdpNamespace = {
  subscribe() {},
  dropUdpSocket() {},
  bind() {},
  connect() {},
  receive() {},
  send() {},
  localAddress() {},
  remoteAddress() {},
  addressFamily() {},
  unicastHopLimit() {},
  setUnicastHopLimit() {},
  receiveBufferSize() {},
  setReceiveBufferSize() {},
  sendBufferSize() {},
  setSendBufferSize() {},
  nonBlocking() {},
  setNonBlocking() {},
};
