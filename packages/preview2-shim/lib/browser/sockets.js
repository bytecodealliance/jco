export const socketsInstanceNetwork = {
  instanceNetwork () {
    console.log(`[sockets] instance network`);
  }
};

export const socketsIpNameLookup = {
  dropResolveAddressStream () {

  },
  subscribe () {
  
  },
  resolveAddresses () {
  
  },
  resolveNextAddress () {
  
  },
  nonBlocking () {
  
  },
  setNonBlocking () {
  
  },
};

export const socketsNetwork = {
  dropNetwork () {

  }
};

export const socketsTcpCreateSocket = {
  createTcpSocket () {

  }
};

export const socketsTcp = {
  subscribe () {

  },
  dropTcpSocket() {
  
  },
  bind() {
  
  },
  connect() {
  
  },
  listen() {
  
  },
  accept() {
  
  },
  localAddress() {
  
  },
  remoteAddress() {
  
  },
  addressFamily() {
  
  },
  ipv6Only() {
  
  },
  setIpv6Only() {
  
  },
  setListenBacklogSize() {
  
  },
  keepAlive() {
  
  },
  setKeepAlive() {
  
  },
  noDelay() {
  
  },
  setNoDelay() {
  
  },
  unicastHopLimit() {
  
  },
  setUnicastHopLimit() {
  
  },
  receiveBufferSize() {
  
  },
  setReceiveBufferSize() {
  
  },
  sendBufferSize() {
  
  },
  setSendBufferSize() {
  
  },
  nonBlocking() {
  
  },
  setNonBlocking() {
  
  },
  shutdown() {
  
  }
};

export const socketsUdp = {
  subscribe () {

  },
  
  dropUdpSocket () {
  
  },
  
  bind () {
  
  },
  
  connect () {
  
  },
  
  receive () {
  
  },
  
  send () {
  
  },
  
  localAddress () {
  
  },
  
  remoteAddress () {
  
  },
  
  addressFamily () {
  
  },
  
  ipv6Only () {
  
  },
  
  setIpv6Only () {
  
  },
  
  unicastHopLimit () {
  
  },
  
  setUnicastHopLimit () {
  
  },
  
  receiveBufferSize () {
  
  },
  
  setReceiveBufferSize () {
  
  },
  
  sendBufferSize () {
  
  },
  
  setSendBufferSize () {
  
  },
  
  nonBlocking () {
  
  },
  
  setNonBlocking () {
  
  }
};

export {
  socketsInstanceNetwork as instanceNetwork,
  socketsIpNameLookup as ipNameLookup,
  socketsNetwork as network,
  socketsTcpCreateSocket as tcpCreateSocket,
  socketsTcp as tcp,
  socketsUdp as udp
}
