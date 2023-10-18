/* eslint-disable no-unused-vars */

import { WasiSockets } from "../sockets/wasi-sockets.js";

const sockets = new WasiSockets();

export const { instanceNetwork, network } = sockets;

export const ipNameLookup = {
  dropResolveAddressStream() {},
  subscribe() {},
  resolveAddresses() {},
  resolveNextAddress() {},
  nonBlocking() {},
  setNonBlocking() {},
};

export const tcpCreateSocket = {
  createTcpSocket(addressFamily) {},
};

export const tcp = {
  subscribe() {},
  dropTcpSocket() {},
  bind() {},
  connect() {},
  listen() {},
  accept() {},
  localAddress() {},
  remoteAddress() {},
  addressFamily() {},
  ipv6Only() {},
  setIpv6Only() {},
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

export const udp = {
  subscribe() {},

  dropUdpSocket() {},

  bind() {},

  connect() {},

  receive() {},

  send() {},

  localAddress() {},

  remoteAddress() {},

  addressFamily() {},

  ipv6Only() {},

  setIpv6Only() {},

  unicastHopLimit() {},

  setUnicastHopLimit() {},

  receiveBufferSize() {},

  setReceiveBufferSize() {},

  sendBufferSize() {},

  setSendBufferSize() {},

  nonBlocking() {},

  setNonBlocking() {},
};

export const udpCreateSocket = {
  createTcpSocket() {},
};
